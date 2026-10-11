import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as messagesApi from '../api/messages.js';
import { CLIENTS_KEY, MY_COACH_KEY } from './useCoach.js';

export const UNREAD_KEY = ['messages', 'unread'];
const THREAD_KEY = ['messages', 'thread'];

// The coach's thread with one client, or (no clientId) the student's thread
// with their coach.
export function threadKey(clientId) {
  return clientId ? [...THREAD_KEY, 'client', clientId] : [...THREAD_KEY, 'mine'];
}

export const THREAD_POLL_MS = 20000;

// "Is anything unread?" for the nav and button dots. It does not poll: it
// refreshes on load, when the app comes back into view, and when a thread
// closes (see useRefreshUnread).
export function useUnread() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async () => Boolean((await messagesApi.getUnread())?.unread),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    retry: false,
  });
}

// Everything that can show a dot: the flag itself and the coach's client
// list (each row carries unreadMessages).
export function useRefreshUnread() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
    queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
  };
}

// The open thread: refetches every 20 seconds and whenever the app comes back
// into view. Nothing is kept once the thread closes (gcTime 0), so reopening
// never flashes an old copy of a connection that may have ended since.
export function useThread(clientId) {
  return useQuery({
    queryKey: threadKey(clientId),
    queryFn: () => (clientId ? messagesApi.getClientThread(clientId) : messagesApi.getMyThread()),
    refetchInterval: THREAD_POLL_MS,
    refetchOnWindowFocus: 'always',
    staleTime: 0,
    gcTime: 0,
    // A 404 is an answer (the connection ended), not a hiccup to retry.
    retry: (count, error) => error?.status !== 404 && count < 1,
  });
}

export function useSendMessage(clientId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => (clientId ? messagesApi.sendClientMessage(clientId, body) : messagesApi.sendMyMessage(body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: threadKey(clientId) }),
    onError: (error) => {
      // The connection ended while the thread was open: every screen that
      // shows the link refreshes.
      if (error?.status === 404) {
        queryClient.invalidateQueries({ queryKey: MY_COACH_KEY });
        queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
        queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
      }
    },
  });
}

// Marks the other person's messages in this thread read, then clears the dots.
export function useMarkThreadRead(clientId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => (clientId ? messagesApi.markClientThreadRead(clientId) : messagesApi.markMyThreadRead()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
      queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
    },
  });
}
