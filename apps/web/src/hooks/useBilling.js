import { useMutation, useQuery } from '@tanstack/react-query';
import * as billingApi from '../api/billing.js';

export function useBillingStatus() {
  return useQuery({
    queryKey: ['billingStatus'],
    queryFn: billingApi.getBillingStatus,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: billingApi.createCheckout,
    // The server hands back the address of Paddle's own payment page and the
    // browser goes there — a plain full-page move, no payment script loaded
    // inside Cut. If no address came back we stay put rather than navigate
    // somewhere meaningless.
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
  });
}
