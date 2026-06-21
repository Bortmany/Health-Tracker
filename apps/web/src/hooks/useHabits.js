import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as habitsApi from '../api/habits.js';

const KEY = ['habits'];

export function useHabits() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await habitsApi.getHabits()).habits,
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: habitsApi.createHabit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...habit }) => habitsApi.updateHabit(id, habit),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: habitsApi.deleteHabit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
