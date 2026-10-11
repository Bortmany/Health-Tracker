import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import PhotoTile from './PhotoTile.jsx';
import PhotoViewer from './PhotoViewer.jsx';
import { Button, ErrorText, SectionTitle, Skeleton } from './ui/index.js';
import { clientPhotosKey, useClientPhotos } from '../hooks/usePhotos.js';
import { formatShortDay } from '../lib/localDate.js';
import styles from './SharedPhotosStrip.module.css';

const IN_CARD_SKELETON = { background: 'var(--color-surface-2)' };

// The coach's "Shared photos" section in a client's summary: only the photos
// this client chose to share, newest first, opened in a read-only viewer.
// Not drawn at all while photo storage isn't set up. `sectionClass` is the
// summary's own section spacing.
export default function SharedPhotosStrip({ clientId, firstName, sectionClass = '', onToast }) {
  const queryClient = useQueryClient();
  const photosQuery = useClientPhotos(clientId);
  const [openId, setOpenId] = useState(null);
  const photos = Array.isArray(photosQuery.data?.photos) ? photosQuery.data.photos : [];
  const openIndex = openId ? photos.findIndex((p) => p.id === openId) : -1;
  const stoppedLine = `${firstName} stopped sharing that photo.`;
  const toastRef = useRef(onToast);
  useEffect(() => {
    toastRef.current = onToast;
  });

  // A refresh no longer lists the open photo: the client turned sharing off
  // (or deleted it). Close it, say so, and never keep showing the old copy.
  useEffect(() => {
    if (openId && photosQuery.isSuccess && openIndex === -1) {
      setOpenId(null);
      toastRef.current?.(stoppedLine);
    }
  }, [openId, openIndex, photosQuery.isSuccess, stoppedLine]);

  // The photo itself answered 404 (unshared since the list loaded).
  function handleGone() {
    setOpenId(null);
    onToast?.(stoppedLine);
    queryClient.invalidateQueries({ queryKey: clientPhotosKey(clientId) });
  }

  // Storage not set up: nothing for coaches, not even "coming soon". A 404
  // (the connection ended) is shown by the summary itself.
  if (photosQuery.data?.enabled === false) return null;
  if (photosQuery.isError && photosQuery.error?.status === 404) return null;

  let body;
  if (photosQuery.isLoading) {
    body = (
      <div className={styles.strip}>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} width={96} height={128} style={{ ...IN_CARD_SKELETON, flexShrink: 0 }} />
        ))}
      </div>
    );
  } else if (photosQuery.isError) {
    body = (
      <div className={styles.errorBlock}>
        <ErrorText>Couldn&apos;t load shared photos.</ErrorText>
        <div>
          <Button variant="secondary" size="sm" onClick={() => photosQuery.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  } else if (photos.length === 0) {
    body = <p className={styles.muted}>{firstName} hasn&apos;t shared any photos with you.</p>;
  } else {
    body = (
      <div className={styles.strip}>
        {photos.map((photo) => (
          <PhotoTile
            key={photo.id}
            className={styles.tile}
            photo={photo}
            ariaLabel={`Photo from ${formatShortDay(photo.takenOn)}`}
            tag={{ text: formatShortDay(photo.takenOn), accent: false }}
            onOpen={() => setOpenId(photo.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={sectionClass}>
      <SectionTitle>Shared photos</SectionTitle>
      <p className={styles.intro}>Photos {firstName} has chosen to share with you.</p>
      {body}
      {openIndex !== -1 && (
        <PhotoViewer
          photos={photos}
          index={openIndex}
          onOpenPhoto={setOpenId}
          onClose={() => setOpenId(null)}
          mode="coach"
          sharedByName={firstName}
          onGone={handleGone}
          onToast={onToast}
        />
      )}
    </div>
  );
}
