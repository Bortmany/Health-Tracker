import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as trainingLogsApi from '../api/trainingLogs.js';

export function useTrainingLogs({ from, to } = {}) {
  return useQuery({
    queryKey: ['trainingLogs', from, to],
    queryFn: async () => (await trainingLogsApi.getTrainingLogs({ from, to })).trainingLogs,
  });
}

export function useTrainingLog(id) {
  return useQuery({
    queryKey: ['trainingLog', id],
    queryFn: async () => (await trainingLogsApi.getTrainingLog(id)).trainingLog,
    enabled: Boolean(id),
  });
}

export function useExerciseHistory(name, { before } = {}) {
  return useQuery({
    queryKey: ['exerciseHistory', name, before],
    queryFn: async () => (await trainingLogsApi.getExerciseHistory(name, { before })).entry,
    enabled: Boolean(name),
  });
}

export function usePersonalRecords() {
  return useQuery({
    queryKey: ['personalRecords'],
    queryFn: async () => (await trainingLogsApi.getPersonalRecords()).records,
  });
}

export function useCreateTrainingLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: trainingLogsApi.createTrainingLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainingLogs'] });
      queryClient.invalidateQueries({ queryKey: ['personalRecords'] });
    },
  });
}

export function useUpdateTrainingLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => trainingLogsApi.updateTrainingLog(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['trainingLogs'] });
      queryClient.invalidateQueries({ queryKey: ['trainingLog', id] });
      queryClient.invalidateQueries({ queryKey: ['personalRecords'] });
    },
  });
}

export function useDeleteTrainingLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: trainingLogsApi.deleteTrainingLog,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trainingLogs'] }),
  });
}
