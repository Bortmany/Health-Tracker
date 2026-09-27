import { useQuery } from '@tanstack/react-query';
import * as coachesApi from '../api/coaches.js';

// Public reads — these work logged out. The server caches the list for five
// minutes, so a short staleTime here just avoids needless refetches.
export function useCoaches(specialty) {
  return useQuery({
    queryKey: ['coaches', specialty ?? null],
    queryFn: async () => (await coachesApi.getCoaches(specialty)).coaches ?? [],
    staleTime: 60 * 1000,
  });
}

export function usePublicCoach(slug) {
  return useQuery({
    queryKey: ['coach', slug],
    queryFn: async () => (await coachesApi.getCoach(slug)).coach,
    enabled: Boolean(slug),
    // A 404 is the real answer ("not public"), not a blip — don't retry it.
    retry: (count, err) => err?.status !== 404 && count < 2,
  });
}

// Who a referral code belongs to, for the sign-up banner. Never retried —
// the banner just falls back to "a Cut coach" if the lookup doesn't resolve.
export function useReferralCoach(code) {
  return useQuery({
    queryKey: ['coach', 'referral', code],
    queryFn: async () => (await coachesApi.getCoachByReferral(code)).coach,
    enabled: Boolean(code),
    retry: false,
    staleTime: Infinity,
  });
}
