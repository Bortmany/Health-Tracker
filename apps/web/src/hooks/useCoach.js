import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as coachApi from '../api/coach.js';

// Every screen that can show a coach–student link reads one of these keys.
// Any change to a link (request, accept, decline, cancel, end) refreshes
// all of them, so no page is left showing a relationship that's over.
export const CLIENTS_KEY = ['coachClients'];
export const MY_COACH_KEY = ['myCoach'];
export const COACH_REQUESTS_KEY = ['coach', 'requests'];
export const COACH_PROFILE_KEY = ['coach', 'profile'];

export function invalidateLinkKeys(queryClient) {
  queryClient.invalidateQueries({ queryKey: MY_COACH_KEY });
  queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
  queryClient.invalidateQueries({ queryKey: COACH_REQUESTS_KEY });
  queryClient.invalidateQueries({ queryKey: ['programs'] });
}

export function useClients() {
  return useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: coachApi.getClients,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.createInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

// "End coaching" from the coach's side (also removes an unused invite code).
export function useRemoveClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.removeClient,
    onSuccess: () => invalidateLinkKeys(queryClient),
  });
}

export function useClientSummary(clientId) {
  return useQuery({
    queryKey: ['clientSummary', clientId],
    queryFn: () => coachApi.getClientSummary(clientId),
    enabled: Boolean(clientId),
  });
}

export function useAssignProgram(clientId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (program) => coachApi.assignProgram(clientId, program),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientSummary', clientId] }),
  });
}

// The coach's private note on one client. Saving refreshes only this note —
// the client list doesn't change when a note does.
export function useClientNote(clientId) {
  return useQuery({
    queryKey: ['clientNote', clientId],
    queryFn: () => coachApi.getClientNote(clientId),
    enabled: Boolean(clientId),
  });
}

export function useSaveClientNote(clientId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => coachApi.saveClientNote(clientId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientNote', clientId] }),
  });
}

// ---- Student side ----

// { coach: {displayName, slug} | null, pendingRequest: {...} | null, coachInvites: [...] }
export function useMyCoach(options = {}) {
  return useQuery({
    queryKey: MY_COACH_KEY,
    queryFn: async () => {
      const data = await coachApi.getMyCoach();
      return {
        coach: data?.coach ?? null,
        pendingRequest: data?.pendingRequest ?? null,
        coachInvites: data?.coachInvites ?? [],
      };
    },
    ...options,
  });
}

export function useRedeemCoachCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.redeemCoachCode,
    onSuccess: () => invalidateLinkKeys(queryClient),
  });
}

// Ends the student's current coaching link (the coach loses access).
export function useRemoveMyCoach() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.removeMyCoach,
    onSuccess: () => invalidateLinkKeys(queryClient),
  });
}

export function useRequestCoach() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.requestCoach,
    // Refresh on failure too: a 409 means this screen's idea of the
    // student's coach was stale, and the fresh answer fixes the button.
    onSettled: () => invalidateLinkKeys(queryClient),
  });
}

export function useCancelCoachRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.cancelCoachRequest,
    onSuccess: () => invalidateLinkKeys(queryClient),
  });
}

export function useAcceptCoachInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, replaceCurrent = false }) => coachApi.acceptCoachInvite(id, { replaceCurrent }),
    onSuccess: () => invalidateLinkKeys(queryClient),
  });
}

export function useDeclineCoachInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.declineCoachInvite,
    onSuccess: () => invalidateLinkKeys(queryClient),
  });
}
