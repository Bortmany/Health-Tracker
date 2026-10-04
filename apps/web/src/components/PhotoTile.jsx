import { useRef } from 'react';
import { usePhotoFile, useNearScreen } from '../hooks/usePhotoFile.js';
import chipStyles from './ui/Chip.module.css';
import { Tooltip } from './ui/index.js';
import styles from './PhotoTile.module.css';

// One 3:4 photo tile. The whole tile is a button that opens the viewer. The
// image only downloads once the tile comes near the screen. `tag` is the
// small label on the bottom gradient: { text, accent }.
export default function PhotoTile({ photo, tag = null, ariaLabel, onOpen, className = '' }) {
  const ref = useRef(null);
  const near = useNearScreen(ref);
  const file = usePhotoFile(photo.url, { active: near });

  return (
    <Tooltip text="Open photo">
    <button
      type="button"
      ref={ref}
      className={`${styles.tile} ${className}`.trim()}
      onClick={onOpen}
      aria-label={ariaLabel}
    >
      {file.status === 'ready' ? (
        <img className={styles.image} src={file.src} alt="" draggable="false" />
      ) : file.status === 'error' || file.status === 'gone' ? (
        <span className={styles.failed}>Couldn&apos;t load</span>
      ) : (
        <span className={`skeleton ${styles.loading}`} aria-hidden="true" />
      )}
      {tag && (
        <span className={styles.labelBar}>
          <span className={`${chipStyles.chip} ${tag.accent ? chipStyles.accent : ''}`.trim()}>{tag.text}</span>
        </span>
      )}
    </button>
    </Tooltip>
  );
}
