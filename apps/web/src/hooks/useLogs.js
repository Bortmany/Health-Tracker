import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as logsApi from '../api/logs.js';

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
  return useQuery({
    queryKey: ['streak'],
    queryFn: async () => (await logsApi.getStreak()).streak,
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
