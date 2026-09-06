import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth.js';
import { ApiError } from '../api/client.js';

const ME_KEY = ['auth', 'me'];

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        const { user } = await authApi.me();
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ user }) => queryClient.setQueryData(ME_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: ({ user }) => queryClient.setQueryData(ME_KEY, user),
  });
}

// Whether sign-up is open, invite-only, or closed. If the check itself fails
// (e.g. offline) the screen falls back to "open" so the form still shows and
// the server gives the real answer on submit.
export function useSignupMode() {
  return useQuery({
    queryKey: ['auth', 'signup-mode'],
    queryFn: async () => {
      const { mode } = await authApi.signupMode();
      return mode;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });
}
