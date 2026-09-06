import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as coachApi from '../api/coach.js';
import { COACH_PROFILE_KEY } from './useCoach.js';

// The signed-in coach's own profile (headline, bio, specialties, switches,
// referral link). Only ever the caller's own — the server scopes it.
export function useCoachProfile(options = {}) {
  return useQuery({
    queryKey: COACH_PROFILE_KEY,
    queryFn: async () => (await coachApi.getProfile()).profile,
    ...options,
  });
}

// Saving refreshes the profile itself and every public view of it: the
// directory list (any filter) and the coach's own public page.
export function useUpdateCoachProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.updateProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(COACH_PROFILE_KEY, data.profile);
      queryClient.invalidateQueries({ queryKey: ['coaches'] });
      if (data.profile?.slug) queryClient.invalidateQueries({ queryKey: ['coach', data.profile.slug] });
    },
  });
}
