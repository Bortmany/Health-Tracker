import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as settingsApi from '../api/settings.js';

const KEY = ['settings'];

export function useSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await settingsApi.getSettings()).settings,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.updateSettings,
    onSuccess: ({ settings }) => queryClient.setQueryData(KEY, settings),
  });
}
