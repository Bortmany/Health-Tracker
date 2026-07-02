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
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
}
