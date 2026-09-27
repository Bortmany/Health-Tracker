import { useQuery } from '@tanstack/react-query';
import * as legalApi from '../api/legal.js';

const KEY = ['legal', 'contact'];

// The contact address shown on the Terms, Privacy and Refunds pages. It only
// changes when the owner changes an environment variable, so cache it for the
// whole visit.
export function useLegalContact() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await legalApi.getContact()).contact,
    staleTime: Infinity,
  });
}
