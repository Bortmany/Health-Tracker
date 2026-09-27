import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as adminApi from '../api/admin.js';

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
