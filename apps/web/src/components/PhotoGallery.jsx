import { useEffect, useRef, useState } from 'react';
import PhotoTile from './PhotoTile.jsx';
import PhotoViewer from './PhotoViewer.jsx';
import { Button, Card, EmptyState, ErrorText, SectionTitle, Skeleton, Tooltip } from './ui/index.js';
import { useMyCoach } from '../hooks/useCoach.js';
import { useMyPhotos, useUploadPhoto } from '../hooks/usePhotos.js';
import {
  PHOTO_ACCEPT,
  PHOTO_LIMIT,
  canRetryUpload,
  checkPhotoFile,
  groupPhotosByDay,
  photoAriaLabel,
  uploadErrorMessage,
} from '../lib/photos.js';
import styles from './PhotoGallery.module.css';

const IN_CARD_SKELETON = { background: 'var(--color-surface-2)' };

let tempCounter = 0;

// A photo still on its way up, or one that failed: { tempId, file, status, message, retryable }.
function PendingTile({ item, onRetry, onDrop }) {
  if (item.status === 'uploading') {
    return (
      <div className={styles.pendingTile} aria-live="polite">
        <span className={`skeleton ${styles.pendingPulse}`} aria-hidden="true" />
        <span className={styles.pendingText}>Uploading...</span>
      </div>
    );
  }
  return (
    <div className={`${styles.pendingTile} ${styles.failedTile}`} role="group" aria-label="Upload failed">
      <Tooltip text="Remove this upload">
        <button
          type="button"
          className={styles.dropButton}
          onClick={onDrop}
          aria-label="Remove this upload"
        >
          ✕
        </button>
      </Tooltip>
      <span className={styles.failedText}>{item.message}</span>
      {item.retryable && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// The student's "Progress photos" card on Progress: add, browse by day, open
// the viewer to share or delete. Every photo starts private.
export default function PhotoGallery({ onToast }) {
  const photosQuery = useMyPhotos();
  const { data: myCoach } = useMyCoach();
  const upload = useUploadPhoto();
  const inputRef = useRef(null);
  const [pickError, setPickError] = useState(null);
  const [pending, setPending] = useState([]);
  const [openId, setOpenId] = useState(null);

  const data = photosQuery.data;
  const photos = Array.isArray(data?.photos) ? data.photos : [];
  const limit = Number(data?.limit) || PHOTO_LIMIT;
  const count = Number.isFinite(Number(data?.count)) ? Number(data.count) : photos.length;
  const uploadingCount = pending.filter((p) => p.status === 'uploading').length;
  const atLimit = count + uploadingCount >= limit;
  const withCoach = Boolean(myCoach?.coach);
  const openIndex = openId ? photos.findIndex((p) => p.id === openId) : -1;

  // The open photo left the list (deleted on another device): close.
  useEffect(() => {
    if (openId && photosQuery.isSuccess && openIndex === -1) setOpenId(null);
  }, [openId, openIndex, photosQuery.isSuccess]);

  // Each upload waits on its own promise, so two photos going up at once
  // each get their own result.
  async function send(tempId, file) {
    setPending((list) => list.map((p) => (p.tempId === tempId ? { ...p, status: 'uploading' } : p)));
    try {
      await upload.mutateAsync(file);
      setPending((list) => list.filter((p) => p.tempId !== tempId));
      onToast?.('Photo added. It stays private until you share it.');
    } catch (error) {
      setPending((list) =>
        list.map((p) =>
          p.tempId === tempId
            ? { ...p, status: 'failed', message: uploadErrorMessage(error), retryable: canRetryUpload(error) }
            : p
        )
      );
    }
  }

  function handlePicked(e) {
    const file = e.target.files?.[0] ?? null;
    // Clear the picker so choosing the same file again still counts.
    e.target.value = '';
    if (!file) return;
    const problem = checkPhotoFile(file, count + uploadingCount, limit);
    if (problem) {
      setPickError(problem);
      return;
    }
    setPickError(null);
    tempCounter += 1;
    const tempId = `upload-${tempCounter}`;
    setPending((list) => [{ tempId, file, status: 'uploading', message: '', retryable: true }, ...list]);
    send(tempId, file);
  }

  function openPicker() {
    setPickError(null);
    inputRef.current?.click();
  }

  const addButton = (
    <Button
      variant="secondary"
      size="sm"
      onClick={atLimit ? undefined : openPicker}
      aria-disabled={atLimit ? 'true' : undefined}
      title={atLimit ? "You've reached 200 photos" : undefined}
    >
      Add photo
    </Button>
  );

  // Storage isn't set up yet: a calm "coming soon", never an error.
  const dormant = photosQuery.isSuccess && data?.enabled === false;
  const ready = photosQuery.isSuccess && !dormant;

  let body;
  if (photosQuery.isLoading) {
    body = (
      <div className={styles.grid}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height="auto" style={{ ...IN_CARD_SKELETON, aspectRatio: '3 / 4' }} />
        ))}
      </div>
    );
  } else if (photosQuery.isError) {
    body = (
      <div className={styles.errorBlock}>
        <ErrorText>Couldn&apos;t load your photos.</ErrorText>
        <div>
          <Button variant="secondary" size="sm" onClick={() => photosQuery.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  } else if (dormant) {
    body = (
      <EmptyState>
        <p className={styles.dormantTitle}>Photo uploads are coming soon</p>
        <p className={styles.dormantLine}>We&apos;re still getting this ready. Everything else on this page works as normal.</p>
      </EmptyState>
    );
  } else if (photos.length === 0 && pending.length === 0) {
    body = (
      <EmptyState
        action={
          <Button onClick={openPicker} disabled={atLimit}>
            Add your first photo
          </Button>
        }
      >
        No photos yet. A photo every couple of weeks shows changes the scale can&apos;t.
      </EmptyState>
    );
  } else {
    const groups = groupPhotosByDay(photos);
    body = (
      <div className={styles.groups}>
        {pending.length > 0 && (
          <div className={styles.grid}>
            {pending.map((item) => (
              <PendingTile
                key={item.tempId}
                item={item}
                onRetry={() => send(item.tempId, item.file)}
                onDrop={() => setPending((list) => list.filter((p) => p.tempId !== item.tempId))}
              />
            ))}
          </div>
        )}
        {groups.map((group) => (
          <div className={styles.group} key={group.day || 'unknown'}>
            <p className={styles.dayLabel}>{group.label}</p>
            <div className={styles.grid}>
              {group.photos.map((photo) => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  ariaLabel={photoAriaLabel(photo, { withCoach })}
                  tag={
                    withCoach
                      ? photo.sharedWithCoach
                        ? { text: 'Shared', accent: true }
                        : { text: 'Private', accent: false }
                      : null
                  }
                  onOpen={() => setOpenId(photo.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <div className={styles.header}>
        <SectionTitle>Progress photos</SectionTitle>
        {ready && addButton}
      </div>
      {ready && (
        <p className={styles.privacyLine}>
          {withCoach
            ? 'Only your coach can see shared photos. Turn it off any time.'
            : 'Only you can see your photos.'}
        </p>
      )}
      {ready && pickError && <ErrorText>{pickError}</ErrorText>}
      {ready && (
        <input
          ref={inputRef}
          className={styles.fileInput}
          type="file"
          accept={PHOTO_ACCEPT}
          onChange={handlePicked}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
      {body}

      {openIndex !== -1 && (
        <PhotoViewer
          photos={photos}
          index={openIndex}
          onOpenPhoto={setOpenId}
          onClose={() => setOpenId(null)}
          mode="owner"
          withCoach={withCoach}
          onToast={onToast}
        />
      )}
    </Card>
  );
}
