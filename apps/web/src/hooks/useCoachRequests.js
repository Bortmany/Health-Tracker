import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as coachApi from '../api/coach.js';
import { COACH_REQUESTS_KEY, invalidateLinkKeys } from './useCoach.js';

// Students waiting on this coach's answer.
export function useCoachRequests() {
  return useQuery({
    queryKey: COACH_REQUESTS_KEY,
    queryFn: async () => (await coachApi.getRequests()).requests ?? [],
  });
}

export function useAcceptRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.acceptRequest,
    // Refresh on failure too: a 409 means the student picked another coach
    // meanwhile, and the stale row should clear.
    onSettled: () => invalidateLinkKeys(queryClient),
  });
}

export function useDeclineRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.declineRequest,
    onSuccess: () => invalidateLinkKeys(queryClient),
  });
}

export function useInviteByEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.inviteByEmail,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coachClients'] }),
  });
}
