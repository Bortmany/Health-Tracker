import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, ConfirmDialog, ErrorText, Switch, Tooltip } from './ui/index.js';
import { useDeletePhoto, useSetPhotoSharing } from '../hooks/usePhotos.js';
import { usePhotoFile } from '../hooks/usePhotoFile.js';
import { formatShortDay } from '../lib/localDate.js';
import { indexAfterDelete } from '../lib/photos.js';
import styles from './PhotoViewer.module.css';

const PRIVACY_LINE = 'Only your coach can see shared photos. Turn it off any time.';
const SWIPE_PX = 50;

// A close via the phone's Back button: the viewer adds one history step
// when it opens, so Back returns to the gallery (scroll position kept)
// instead of leaving the page. Closing with the ✕ removes that step again.
// The short delay lets React's development double-mount keep its one step.
let pendingBack = null;

function useBackCloses(onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (pendingBack) {
      window.clearTimeout(pendingBack);
      pendingBack = null;
    } else if (!window.history.state?.cutPhotoViewer) {
      window.history.pushState({ ...window.history.state, cutPhotoViewer: true }, '');
    }
    let closedByBack = false;
    function handlePop() {
      if (window.history.state?.cutPhotoViewer) return;
      closedByBack = true;
      onCloseRef.current?.();
    }
    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
      if (closedByBack) return;
      pendingBack = window.setTimeout(() => {
        pendingBack = null;
        if (window.history.state?.cutPhotoViewer) window.history.back();
      }, 0);
    };
  }, []);
}

function ViewerImage({ photo, onGone }) {
  const [attempt, setAttempt] = useState(0);
  const file = usePhotoFile(photo.url, { attempt });
  const goneRef = useRef(onGone);
  useEffect(() => {
    goneRef.current = onGone;
  });

  useEffect(() => {
    if (file.status === 'gone') goneRef.current?.();
  }, [file.status]);

  if (file.status === 'ready') {
    return <img className={styles.image} src={file.src} alt={`Progress photo from ${formatShortDay(photo.takenOn)}`} />;
  }
  if (file.status === 'error' || file.status === 'gone') {
    return (
      <div className={styles.imageBox}>
        <p className={styles.boxText}>Couldn&apos;t load this photo</p>
        <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          Retry
        </Button>
      </div>
    );
  }
  return <div className={`skeleton ${styles.imageBox} ${styles.imageSkeleton}`} aria-label="Loading photo" />;
}

// Full-screen photo viewer, drawn over everything (not a separate page).
// mode 'owner': the student's own photo, with the share switch (only with a
//   coach) and Delete.
// mode 'coach': read only, "Shared by {name}"; no switch, delete or download.
export default function PhotoViewer({
  photos,
  index,
  onOpenPhoto,
  onClose,
  mode = 'owner',
  withCoach = false,
  sharedByName = '',
  onToast,
  onGone,
}) {
  const photo = photos[index] ?? null;
  const closeRef = useRef(null);
  const touchX = useRef(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareError, setShareError] = useState(false);
  const setSharing = useSetPhotoSharing();
  const deletePhoto = useDeletePhoto();
  const isOwner = mode === 'owner';

  useBackCloses(onClose);

  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;
  const showPrev = () => hasPrev && onOpenPhoto(photos[index - 1].id);
  const showNext = () => hasNext && onOpenPhoto(photos[index + 1].id);

  // Keyboard: ← and → move, Esc closes (Esc belongs to the delete question
  // while that is open).
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (confirmOpen) return;
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowLeft') showPrev();
    else if (e.key === 'ArrowRight') showNext();
  };
  useEffect(() => {
    function handleKeyDown(e) {
      keyRef.current?.(e);
    }
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // A new photo on screen starts without the last one's sharing error.
  const resetDelete = deletePhoto.reset;
  useEffect(() => {
    setShareError(false);
    resetDelete();
  }, [photo?.id, resetDelete]);

  if (!photo) return null;

  function handleTouchStart(e) {
    touchX.current = e.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(e) {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (dx <= -SWIPE_PX) showNext();
    else if (dx >= SWIPE_PX) showPrev();
  }

  // While saving, the switch shows where it's going; if the save fails it
  // goes back (the list still holds the old value) and says so.
  const savingThis = setSharing.isPending && setSharing.variables?.id === photo.id;
  const shared = savingThis ? Boolean(setSharing.variables.sharedWithCoach) : Boolean(photo.sharedWithCoach);

  function handleShareChange(next) {
    setShareError(false);
    setSharing.mutate(
      { id: photo.id, sharedWithCoach: next },
      {
        onSuccess: () => onToast?.(next ? 'Shared with your coach' : "Now private. Your coach can't see it."),
        onError: () => setShareError(true),
      }
    );
  }

  function handleDelete() {
    // Worked out from the list as it is now, before the deleted photo
    // leaves it: the next (older) photo, or the one before at the end.
    const remaining = photos.filter((p) => p.id !== photo.id);
    const next = indexAfterDelete(photos.length, index);
    deletePhoto.mutate(photo.id, {
      onSuccess: () => {
        setConfirmOpen(false);
        onToast?.('Photo deleted');
        if (next == null) onClose();
        else onOpenPhoto(remaining[next].id);
      },
      onError: () => setConfirmOpen(false),
    });
  }

  const dateLabel = formatShortDay(photo.takenOn);

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Photo from ${dateLabel}`}>
      <div className={styles.topBar}>
        <Tooltip text="Close photo">
          <button
            type="button"
            ref={closeRef}
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Close photo"
          >
            ✕
          </button>
        </Tooltip>
        <span className={styles.date}>{dateLabel}</span>
        <span className={styles.iconSpacer} aria-hidden="true" />
      </div>

      <div className={styles.stage} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <Tooltip text="Previous photo">
          <button
            type="button"
            className={`${styles.iconButton} ${styles.navButton}`}
            onClick={showPrev}
            disabled={!hasPrev}
            aria-label="Previous photo"
          >
            ‹
          </button>
        </Tooltip>
        <div className={styles.imageWrap}>
          <ViewerImage key={photo.id} photo={photo} onGone={isOwner ? undefined : onGone} />
        </div>
        <Tooltip text="Next photo">
          <button
            type="button"
            className={`${styles.iconButton} ${styles.navButton}`}
            onClick={showNext}
            disabled={!hasNext}
            aria-label="Next photo"
          >
            ›
          </button>
        </Tooltip>
      </div>

      <div className={styles.panel}>
        {isOwner ? (
          <>
            {withCoach && (
              <div className={styles.shareBlock}>
                <Switch
                  checked={shared}
                  onChange={handleShareChange}
                  label="Share with my coach"
                  disabled={setSharing.isPending || deletePhoto.isPending}
                />
                <p className={styles.muted}>{PRIVACY_LINE}</p>
                {shareError && <ErrorText>Couldn&apos;t change sharing. Please try again.</ErrorText>}
              </div>
            )}
            <Button variant="danger" block onClick={() => setConfirmOpen(true)} disabled={deletePhoto.isPending}>
              Delete photo
            </Button>
            {deletePhoto.isError && !confirmOpen && (
              <ErrorText>Couldn&apos;t delete this photo. Please try again.</ErrorText>
            )}
          </>
        ) : (
          <p className={styles.muted}>Shared by {sharedByName}</p>
        )}
      </div>

      {isOwner && (
        <ConfirmDialog
          open={confirmOpen}
          message="Delete this photo? It's removed for good, and your coach won't be able to see it either. This can't be undone."
          confirmLabel={deletePhoto.isPending ? 'Deleting...' : 'Delete photo'}
          busy={deletePhoto.isPending}
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>,
    document.body
  );
}
