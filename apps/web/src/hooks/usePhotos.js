import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as photosApi from '../api/photos.js';
import { localToday } from '../lib/localDate.js';
import { CLIENTS_KEY } from './useCoach.js';

export const PHOTOS_KEY = ['photos'];
const CLIENT_PHOTOS_KEY = ['coach', 'clientPhotos'];

export function clientPhotosKey(clientId) {
  return [...CLIENT_PHOTOS_KEY, clientId];
}

// Every screen that lists photos reads one of these keys, so an added,
// shared, unshared or deleted photo never leaves a stale copy anywhere.
function invalidatePhotoKeys(queryClient) {
  queryClient.invalidateQueries({ queryKey: PHOTOS_KEY });
  queryClient.invalidateQueries({ queryKey: CLIENT_PHOTOS_KEY });
}

// The student's own gallery: { enabled, photos, count, limit }.
export function useMyPhotos() {
  return useQuery({
    queryKey: PHOTOS_KEY,
    queryFn: photosApi.getMyPhotos,
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file) => photosApi.uploadPhoto(file, localToday()),
    onSuccess: (result) => {
      // Put the new photo in the list straight away so its tile doesn't
      // blink out between the upload finishing and the list reloading.
      if (result?.photo) {
        queryClient.setQueryData(PHOTOS_KEY, (old) =>
          old && Array.isArray(old.photos) && !old.photos.some((p) => p.id === result.photo.id)
            ? { ...old, photos: [result.photo, ...old.photos], count: (old.count ?? old.photos.length) + 1 }
            : old
        );
      }
      invalidatePhotoKeys(queryClient);
    },
    onError: (error) => {
      // Storage was switched off meanwhile: the gallery goes to "coming soon".
      if (error?.code === 'PHOTOS_DISABLED') queryClient.invalidateQueries({ queryKey: PHOTOS_KEY });
    },
  });
}

export function useSetPhotoSharing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sharedWithCoach }) => photosApi.setPhotoSharing(id, sharedWithCoach),
    onSuccess: (result) => {
      if (result?.photo) {
        queryClient.setQueryData(PHOTOS_KEY, (old) =>
          old && Array.isArray(old.photos)
            ? { ...old, photos: old.photos.map((p) => (p.id === result.photo.id ? { ...p, ...result.photo } : p)) }
            : old
        );
      }
      invalidatePhotoKeys(queryClient);
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => photosApi.deletePhoto(id),
    // The list refreshes from the server rather than dropping the photo
    // here, so the open viewer can move to the next photo first.
    onSuccess: () => {
      invalidatePhotoKeys(queryClient);
    },
  });
}

// ---- Coach side ----

// The photos one client shares with this coach. Refetched whenever the app
// comes back into view, so a photo the client stopped sharing disappears.
// Nothing is kept once the summary closes (gcTime 0), so reopening never
// flashes photos from a connection that may have ended since.
export function useClientPhotos(clientId) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: clientPhotosKey(clientId),
    queryFn: async () => {
      try {
        return await photosApi.getClientPhotos(clientId);
      } catch (error) {
        // The connection ended: every screen that shows the link refreshes.
        if (error?.status === 404) {
          queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
          queryClient.invalidateQueries({ queryKey: ['clientSummary', clientId] });
        }
        throw error;
      }
    },
    enabled: Boolean(clientId),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: 'always',
    // A 404 is an answer (the connection ended), not a hiccup to retry.
    retry: (count, error) => error?.status !== 404 && count < 1,
  });
}
