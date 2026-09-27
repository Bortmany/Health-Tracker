import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as logsApi from '../api/logs.js';
import { localToday } from '../lib/localDate.js';

export function useLog(date) {
  return useQuery({
    queryKey: ['log', date],
    queryFn: () => logsApi.getLog(date),
    enabled: Boolean(date),
  });
}

export function useLogsRange({ from, to } = {}) {
  return useQuery({
    queryKey: ['logs', from, to],
    queryFn: async () => (await logsApi.getLogs({ from, to })).logs,
  });
}

export function useHabitSummary({ from, to } = {}) {
  return useQuery({
    queryKey: ['habitSummary', from, to],
    queryFn: async () => (await logsApi.getHabitSummary({ from, to })).days,
  });
}

export function useStreak() {
  // Part of the key, so the streak refreshes once the device passes midnight.
  const today = localToday();
  return useQuery({
    queryKey: ['streak', today],
    queryFn: async () => (await logsApi.getStreak(today)).streak,
  });
}

export function usePutLog(date) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => logsApi.putLog(date, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['log', date] });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['habitSummary'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
    },
  });
}
