import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as billingApi from '../api/billing.js';
import { ApiError } from '../api/client.js';
import { common } from '../lib/billingCopy.js';
import { normalizeStatus, normalizeSubscriptions, safeCheckoutUrl } from '../lib/billingLogic.js';
import { MY_COACH_KEY } from './useCoach.js';

export const BILLING_STATUS_KEY = ['billingStatus'];
export const SUBSCRIPTIONS_KEY = ['billing', 'subscriptions'];

// The money switch, read once and shared by every screen. If the call itself
// fails we treat money as OFF (the page still works for reading), so a money
// button can never light up by accident.
export function useBillingStatus() {
  return useQuery({
    queryKey: BILLING_STATUS_KEY,
    queryFn: async () => normalizeStatus(await billingApi.getBillingStatus()),
    retry: 1,
    staleTime: 60 * 1000,
  });
}

// What every money button needs: still loading, or on/off.
export function useMoneySwitch() {
  const { data, isLoading } = useBillingStatus();
  const status = data ?? normalizeStatus(null);
  return { loading: isLoading, on: !isLoading && status.configured, status };
}

// Takes the server's checkout/onboarding reply, checks the address is a real
// https one, and moves the browser there (a plain full-page move). Anything
// else is an error, never a navigation somewhere strange.
export function goToProviderPage(reply, key) {
  const url = safeCheckoutUrl(reply?.[key]);
  if (!url) throw new ApiError(common.checkoutError, 'CHECKOUT_URL', 502);
  window.location.assign(url);
  return url;
}

// The signed-in person's own subscriptions.
export function useSubscriptions() {
  return useQuery({
    queryKey: SUBSCRIPTIONS_KEY,
    queryFn: async () => normalizeSubscriptions(await billingApi.getSubscriptions()),
  });
}

// Cancelling changes the list, the plan label on the account, and (for a
// coach subscription) the student's coach link.
export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: billingApi.cancelSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBSCRIPTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: BILLING_STATUS_KEY });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: MY_COACH_KEY });
    },
  });
}

export function useAiCheckout() {
  return useMutation({
    mutationFn: async (interval) => goToProviderPage(await billingApi.createAiCheckout(interval), 'checkoutUrl'),
  });
}

export function useCoachCheckout() {
  return useMutation({
    mutationFn: async (coachId) => goToProviderPage(await billingApi.createCoachCheckout(coachId), 'checkoutUrl'),
  });
}
