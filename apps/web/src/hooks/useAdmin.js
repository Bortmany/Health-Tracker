import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as adminApi from '../api/admin.js';
import { normalizeAdminEarnings } from '../lib/billingLogic.js';

const APPLICATIONS_KEY = (status) => ['admin', 'coachApplications', status];
const COACHES_KEY = ['admin', 'coaches'];

// `enabled` lets the admin screen hold these back until the admin check
// has passed — a non-admin must never trigger these requests at all.
export function useCoachApplications(status = 'pending', { enabled = true } = {}) {
  return useQuery({
    queryKey: APPLICATIONS_KEY(status),
    queryFn: () => adminApi.getCoachApplications(status),
    enabled,
  });
}

export function useCoaches({ enabled = true } = {}) {
  return useQuery({
    queryKey: COACHES_KEY,
    queryFn: adminApi.getCoaches,
    enabled,
  });
}

const EARNINGS_KEY = ['admin', 'coachEarnings'];
const PAYOUTS_KEY = ['admin', 'payouts'];
export const ADMIN_PAYOUTS_PAGE = 20;

// Who is owed what (owner only; held back until the admin check passes).
export function useAdminEarnings({ enabled = true } = {}) {
  return useQuery({
    queryKey: EARNINGS_KEY,
    queryFn: async () => normalizeAdminEarnings(await adminApi.getCoachEarnings()),
    enabled,
  });
}

// What has been paid out, newest first, twenty at a time.
export function useAdminPayouts({ enabled = true } = {}) {
  return useInfiniteQuery({
    queryKey: PAYOUTS_KEY,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => adminApi.getPayouts({ limit: ADMIN_PAYOUTS_PAGE, offset: pageParam }),
    getNextPageParam: (last, all) =>
      last?.hasMore ? all.reduce((n, page) => n + (page?.payouts?.length ?? 0), 0) : undefined,
    enabled,
  });
}

// "Pay coaches now". A run changes the owed amounts, the history and each
// coach's own earnings, so all of them refresh — on failure too, since a
// partial run still moved some money.
export function useRunPayouts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.runPayouts,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: EARNINGS_KEY });
      queryClient.invalidateQueries({ queryKey: PAYOUTS_KEY });
      queryClient.invalidateQueries({ queryKey: COACHES_KEY });
    },
  });
}

// Every decision touches both lists (an approval adds a coach; a revoke
// may free someone to apply again), so all three refresh both.
function useRefreshAdminLists() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'coachApplications'] });
    queryClient.invalidateQueries({ queryKey: COACHES_KEY });
  };
}

export function useApproveApplication() {
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: adminApi.approveApplication,
    onSuccess: refresh,
  });
}

export function useDeclineApplication() {
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: ({ id, reason }) => adminApi.declineApplication(id, reason),
    onSuccess: refresh,
  });
}

export function useRevokeCoach() {
  const refresh = useRefreshAdminLists();
  return useMutation({
    mutationFn: adminApi.revokeCoach,
    onSuccess: refresh,
  });
}
