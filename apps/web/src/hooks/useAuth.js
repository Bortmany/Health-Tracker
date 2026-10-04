import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as authApi from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { isSignedOutError, ME_REASK_MS, meRetryDelay, shouldRetryMe } from '../lib/authErrors.js';

const ME_KEY = ['auth', 'me'];

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        const { user } = await authApi.me();
        return user;
      } catch (err) {
        if (err instanceof ApiError && isSignedOutError(err.status)) return null;
        throw err;
      }
    },
    // Only a 401 means signed out. A busy server (429) or a dropped
    // connection is retried with growing waits, and the saved user is kept.
    retry: shouldRetryMe,
    retryDelay: meRetryDelay,
    // No saved user and the retries ran out: keep asking quietly.
    refetchInterval: (query) =>
      query.state.status === 'error' && query.state.data === undefined ? ME_REASK_MS : false,
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

// Asks for a reset link. No cache to refresh: nothing about the signed-in
// state changes (the person isn't signed in).
export function useForgotPassword() {
  return useMutation({ mutationFn: authApi.forgotPassword });
}

// Choosing a new password signs the person out everywhere, so any cached
// "who am I" is cleared too.
export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });
}
