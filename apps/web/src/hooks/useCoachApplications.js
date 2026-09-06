import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/coachApplications.js';

export const MY_APPLICATION_KEY = ['coachApplication', 'mine'];
const ME_KEY = ['auth', 'me'];

// { application: null | {...}, canReapply: boolean }
export function useMyApplication() {
  return useQuery({
    queryKey: MY_APPLICATION_KEY,
    queryFn: api.getMyApplication,
  });
}

// Both mutations refresh the account too: an approval flips the user's
// role, and the More page decides what to show from both together.
export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_APPLICATION_KEY });
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export function useWithdrawApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.withdrawApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_APPLICATION_KEY });
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
