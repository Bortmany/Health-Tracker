import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorText, Screen, Skeleton } from './ui/index.js';
import { MY_COACH_KEY } from '../hooks/useCoach.js';
import { useMarkThreadRead, useRefreshUnread, useSendMessage, useThread } from '../hooks/useMessages.js';
import {
  buildThreadItems,
  canSend,
  counterText,
  isAtLimit,
  isLinkEnded,
  latestUnreadFromOther,
  MESSAGE_MAX,
  mergeThread,
  pruneConfirmed,
  sendErrorKind,
} from '../lib/messages.js';
import styles from './MessageThread.module.css';

const LAPTOP_QUERY = '(min-width: 1024px)';
// Within this distance of the bottom counts as "reading the newest".
const NEAR_BOTTOM_PX = 48;

const COMPOSER_ERRORS = {
  rateLimited: "You're sending messages very quickly. Please wait a few minutes.",
  tooLong: 'Messages can be up to 2,000 characters.',
};

function BackLink({ to, children }) {
  return (
    <Link className={styles.backLink} to={to}>
      {children}
    </Link>
  );
}

// One bubble, plus the small lines under it (Sending..., the time, Sent/Seen).
// A failed bubble is itself the "try again" button.
function Bubble({ item, onRetry }) {
  const m = item.message;
  const side = m.mine ? styles.rowMine : styles.rowTheirs;
  const meta = [item.time, item.receipt].filter(Boolean).join(' · ');

  if (m.status === 'failed') {
    return (
      <div className={side}>
        <button type="button" className={styles.failedButton} onClick={() => onRetry(m)}>
          <span className={`${styles.bubble} ${styles.bubbleMine}`}>{m.body}</span>
          <span className={styles.failedLine}>Couldn&apos;t send. Tap to try again.</span>
        </button>
      </div>
    );
  }

  return (
    <div className={side}>
      <div
        className={`${styles.bubble} ${m.mine ? styles.bubbleMine : styles.bubbleTheirs} ${
          m.status === 'sending' ? styles.bubbleSending : ''
        }`}
      >
        {m.body}
      </div>
      {m.status === 'sending' && <span className={styles.meta}>Sending...</span>}
      {meta && <span className={styles.meta}>{meta}</span>}
    </div>
  );
}

// The box at the bottom: grows from 1 to 4 lines, counts from 1,800 and stops
// at 2,000. On a laptop Enter sends (Shift+Enter is a new line); on a phone
// Enter is always a new line and the Send button sends.
function Composer({ value, onChange, onSend, disabled = false, error = null }) {
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 24;
    const extra =
      parseFloat(cs.paddingTop) +
      parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) +
      parseFloat(cs.borderBottomWidth);
    const max = line * 4 + extra;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value]);

  function handleKeyDown(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    if (!window.matchMedia(LAPTOP_QUERY).matches) return;
    e.preventDefault();
    onSend();
  }

  const counter = counterText(value.length);

  return (
    <div className={styles.composer}>
      {error && <ErrorText>{COMPOSER_ERRORS[error]}</ErrorText>}
      <div className={styles.composerRow}>
        <textarea
          ref={boxRef}
          className={styles.input}
          rows={1}
          maxLength={MESSAGE_MAX}
          placeholder="Write a message"
          aria-label="Write a message"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.slice(0, MESSAGE_MAX))}
          onKeyDown={handleKeyDown}
        />
        <span className={styles.sendSlot}>
          <Button size="sm" onClick={onSend} disabled={disabled || !canSend(value)}>
            Send
          </Button>
        </span>
      </div>
      {counter && (
        <div className={isAtLimit(value.length) ? styles.counterOver : styles.counter} aria-live="polite">
          {counter}
        </div>
      )}
      <p className={styles.hint}>Enter to send, Shift+Enter for a new line</p>
    </div>
  );
}

function LoadingThread() {
  return (
    <div className={styles.frame}>
      <div className={styles.list} aria-hidden="true">
        {[48, 72, 48, 72].map((height, i) => (
          <div className={i % 2 ? styles.rowMine : styles.rowTheirs} key={i}>
            <Skeleton height={height} width={i % 2 ? '60%' : '70%'} style={{ background: 'var(--color-surface-2)' }} />
          </div>
        ))}
      </div>
      <Composer value="" onChange={() => {}} onSend={() => {}} disabled />
    </div>
  );
}

// The loaded thread: the list, the composer, sending and read receipts.
function Conversation({ clientId, data, pollFailed, renderEmpty, onEnded }) {
  const send = useSendMessage(clientId);
  const markRead = useMarkThreadRead(clientId);
  const [text, setText] = useState('');
  const textRef = useRef('');
  const [outbox, setOutbox] = useState([]);
  const [confirmed, setConfirmed] = useState([]);
  const [composerError, setComposerError] = useState(null);
  const [showPill, setShowPill] = useState(false);
  const listRef = useRef(null);
  const atBottomRef = useRef(true);
  const lastKeyRef = useRef(null);
  const markedRef = useRef(null);
  const tempCount = useRef(0);

  const server = Array.isArray(data?.messages) ? data.messages : [];
  const otherName = data?.thread?.otherName ?? '';

  function updateText(value) {
    textRef.current = value;
    setText(value);
  }

  // Drop locally kept sends once a poll brings them back from the server.
  useEffect(() => {
    setConfirmed((c) => {
      const kept = pruneConfirmed(server, c);
      return kept.length === c.length ? c : kept;
    });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opening the thread marks it read; so does any poll that brings a new
  // message from the other person.
  const unreadId = latestUnreadFromOther(server);
  useEffect(() => {
    if (markedRef.current === null || (unreadId && unreadId !== markedRef.current)) {
      markedRef.current = unreadId ?? 'opened';
      markRead.mutate();
    }
  }, [unreadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const merged = mergeThread(server, confirmed, outbox);
  const empty = merged.length === 0 ? renderEmpty(otherName) : null;
  const items = buildThreadItems(merged);
  const last = merged[merged.length - 1];
  const lastKey = last ? (last.id ?? last.tempId) : null;

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setShowPill(false);
  }, []);

  // Opens at the newest message. Later, a new message scrolls into view if
  // the person is already at the bottom (or wrote it); otherwise the
  // "New message" pill appears.
  useLayoutEffect(() => {
    if (lastKey === lastKeyRef.current) return;
    const first = lastKeyRef.current === null;
    lastKeyRef.current = lastKey;
    if (first || atBottomRef.current || last?.mine) scrollToBottom();
    else setShowPill(true);
  }, [lastKey, last, scrollToBottom]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    atBottomRef.current = atBottom;
    if (atBottom) setShowPill(false);
  }

  function deliver(entry) {
    send.mutateAsync(entry.body).then(
      (result) => {
        setOutbox((o) => o.filter((x) => x.tempId !== entry.tempId));
        if (result?.message) setConfirmed((c) => [...c, result.message]);
      },
      (error) => {
        const kind = sendErrorKind(error);
        if (kind === 'ended') {
          onEnded();
          return;
        }
        if ((kind === 'rateLimited' || kind === 'tooLong') && textRef.current.trim() === '') {
          // The message goes back into the box, so nothing is lost.
          setOutbox((o) => o.filter((x) => x.tempId !== entry.tempId));
          updateText(entry.body);
          setComposerError(kind);
          return;
        }
        if (kind === 'rateLimited' || kind === 'tooLong') setComposerError(kind);
        setOutbox((o) => o.map((x) => (x.tempId === entry.tempId ? { ...x, status: 'failed' } : x)));
      }
    );
  }

  function handleSend() {
    if (!canSend(text)) return;
    tempCount.current += 1;
    const entry = {
      tempId: `pending-${Date.now()}-${tempCount.current}`,
      body: text.trim(),
      createdAt: new Date().toISOString(),
      readAt: null,
      mine: true,
      status: 'sending',
    };
    setComposerError(null);
    setOutbox((o) => [...o, entry]);
    updateText('');
    deliver(entry);
  }

  function handleRetry(entry) {
    setComposerError(null);
    setOutbox((o) => o.map((x) => (x.tempId === entry.tempId ? { ...x, status: 'sending' } : x)));
    deliver(entry);
  }

  return (
    <div className={styles.frame}>
      {pollFailed && <p className={styles.offline}>Can&apos;t reach the server. Trying again...</p>}
      <div className={styles.list} ref={listRef} onScroll={handleScroll} aria-live="polite">
        {empty ? (
          <div className={styles.emptySlot}>
            <EmptyState>
              {empty.title && <p className={styles.emptyTitle}>{empty.title}</p>}
              <p className={styles.emptyBody}>{empty.body}</p>
            </EmptyState>
          </div>
        ) : (
          items.map((item) =>
            item.type === 'day' ? (
              <div className={styles.dayDivider} key={item.key}>
                {item.label}
              </div>
            ) : (
              <Bubble key={item.key} item={item} onRetry={handleRetry} />
            )
          )
        )}
        {showPill && (
          <div className={styles.pillSlot}>
            <Button size="sm" onClick={scrollToBottom}>
              New message
            </Button>
          </div>
        )}
      </div>
      <Composer
        value={text}
        onChange={(value) => {
          updateText(value);
          if (composerError) setComposerError(null);
        }}
        onSend={handleSend}
        error={composerError}
      />
    </div>
  );
}

// The whole thread screen, shared by the student (/messages, no clientId)
// and the coach (/coach/clients/:clientId/messages). The server decides who
// may read it: a 404 means the connection ended, and then nothing from the
// thread is shown, never an old copy.
export default function MessageThread({ clientId = null, backTo, backLabel, endedLabel, renderEmpty }) {
  const queryClient = useQueryClient();
  const thread = useThread(clientId);
  const refreshUnread = useRefreshUnread();
  const [sendEnded, setSendEnded] = useState(false);
  const linkEnded = sendEnded || isLinkEnded(thread.error);

  // Closing the thread refreshes the dots (nav, More, Clients rows).
  const refreshRef = useRef(refreshUnread);
  refreshRef.current = refreshUnread;
  useEffect(() => () => refreshRef.current(), []);

  // The connection ended: every screen that shows the link refreshes too.
  useEffect(() => {
    if (!linkEnded) return;
    queryClient.invalidateQueries({ queryKey: MY_COACH_KEY });
    refreshRef.current();
  }, [linkEnded, queryClient]);

  let title = 'Messages';
  let body;
  if (linkEnded) {
    body = (
      <EmptyState
        action={
          <Link className={styles.linkAsButton} to={backTo}>
            {endedLabel}
          </Link>
        }
      >
        <p className={styles.emptyTitle}>You&apos;re no longer connected.</p>
        <p className={styles.emptyBody}>Messages are closed because this coaching connection has ended.</p>
      </EmptyState>
    );
  } else if (thread.isLoading) {
    body = <LoadingThread />;
  } else if (thread.isError && !thread.data) {
    body = (
      <div className={styles.errorBlock}>
        <ErrorText>Couldn&apos;t load your messages.</ErrorText>
        <Button variant="secondary" size="sm" onClick={() => thread.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else {
    title = thread.data?.thread?.otherName || 'Messages';
    body = (
      <Conversation
        clientId={clientId}
        data={thread.data}
        pollFailed={thread.isError}
        renderEmpty={renderEmpty}
        onEnded={() => setSendEnded(true)}
      />
    );
  }

  return (
    <Screen title={title} label={<BackLink to={backTo}>{backLabel}</BackLink>}>
      {body}
    </Screen>
  );
}
