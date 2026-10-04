import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as coachBillingApi from '../api/coachBilling.js';
import { normalizeCoachBilling } from '../lib/billingLogic.js';
import { goToProviderPage } from './useBilling.js';

// The signed-in coach's own money. Keys all start with ['coach', ...] so a
// change to the price, the fee or the identity check refreshes the card, the
// earnings and the accept buttons together.
export const COACH_BILLING_KEY = ['coach', 'billing'];
export const COACH_EARNINGS_KEY = ['coach', 'earnings'];
export const COACH_PAYOUTS_KEY = ['coach', 'payouts'];

export const PAYOUTS_PAGE = 10;

export function useCoachBilling(options = {}) {
  return useQuery({
    queryKey: COACH_BILLING_KEY,
    queryFn: async () => normalizeCoachBilling(await coachBillingApi.getCoachBilling()),
    ...options,
  });
}

export function useSetCoachPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachBillingApi.setCoachPrice,
    onSuccess: (data) => {
      queryClient.setQueryData(COACH_BILLING_KEY, normalizeCoachBilling(data));
      queryClient.invalidateQueries({ queryKey: COACH_BILLING_KEY });
      queryClient.invalidateQueries({ queryKey: COACH_EARNINGS_KEY });
    },
  });
}

export function useStartupFee() {
  return useMutation({
    mutationFn: async () => goToProviderPage(await coachBillingApi.startStartupFee(), 'checkoutUrl'),
  });
}

export function useOnboarding() {
  return useMutation({
    mutationFn: async () => goToProviderPage(await coachBillingApi.startOnboarding(), 'url'),
  });
}

export function useCoachEarnings(options = {}) {
  return useQuery({
    queryKey: COACH_EARNINGS_KEY,
    queryFn: coachBillingApi.getEarnings,
    ...options,
  });
}

// Newest first, ten at a time; "Show more" asks for the next ten.
export function useCoachPayouts() {
  return useInfiniteQuery({
    queryKey: COACH_PAYOUTS_KEY,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => coachBillingApi.getPayouts({ limit: PAYOUTS_PAGE, offset: pageParam }),
    getNextPageParam: (last, all) =>
      last?.hasMore ? all.reduce((n, page) => n + (page?.payouts?.length ?? 0), 0) : undefined,
  });
}
