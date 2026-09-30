import { useEffect, useState } from 'react';
import { isOwnPhotoUrl } from '../lib/photos.js';

// Loads one photo through the server's signed-in address: fetched with the
// login cookie, kept in memory as a blob, and shown through a temporary
// object URL that is thrown away once nothing on screen uses it. There is
// never a public link to a photo.
//
// A tile and the viewer often show the same photo at once, so each image is
// fetched once and shared; the last one to stop using it frees it.

const cache = new Map(); // url -> { refs, promise, objectUrl }

class PhotoFileError extends Error {
  constructor(status) {
    super('Photo could not be loaded');
    this.status = status;
  }
}

function acquire(url) {
  let entry = cache.get(url);
  if (!entry) {
    entry = { refs: 0, objectUrl: null, promise: null };
    entry.promise = fetch(url, { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new PhotoFileError(res.status);
        const blob = await res.blob();
        entry.objectUrl = URL.createObjectURL(blob);
        // Everyone let go while it was still downloading: free it at once.
        if (entry.refs <= 0) {
          URL.revokeObjectURL(entry.objectUrl);
          if (cache.get(url) === entry) cache.delete(url);
        }
        return entry.objectUrl;
      })
      .catch((error) => {
        // A failure is never kept: "Retry" fetches again.
        if (cache.get(url) === entry) cache.delete(url);
        throw error;
      });
    cache.set(url, entry);
  }
  entry.refs += 1;
  return entry;
}

function release(url, entry) {
  entry.refs -= 1;
  if (entry.refs > 0) return;
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  if (cache.get(url) === entry) cache.delete(url);
}

// status: 'idle' (not asked yet) | 'loading' | 'ready' | 'gone' (404: the
// photo was deleted or unshared, or the connection ended) | 'error'.
// `active` false waits (used by tiles until they scroll into view).
export function usePhotoFile(url, { active = true, attempt = 0 } = {}) {
  const [state, setState] = useState({ status: 'idle', src: null });

  useEffect(() => {
    if (!active || !url) return undefined;
    if (!isOwnPhotoUrl(url)) {
      setState({ status: 'error', src: null });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading', src: null });
    const entry = acquire(url);
    entry.promise.then(
      (src) => {
        if (!cancelled) setState({ status: 'ready', src });
      },
      (error) => {
        if (!cancelled) setState({ status: error?.status === 404 ? 'gone' : 'error', src: null });
      }
    );
    return () => {
      cancelled = true;
      release(url, entry);
    };
  }, [url, active, attempt]);

  return state;
}

// True once the element has come near the screen (or straight away where
// the browser can't tell), so a long gallery doesn't download every photo
// at once.
export function useNearScreen(ref) {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !ref.current || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '200px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near, ref]);
  return near;
}
