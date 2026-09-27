import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as habitsApi from '../api/habits.js';

const KEY = ['habits'];

// Adding or removing a habit changes what every day's checklist should show.
// We mark the saved days stale without pulling them again right now, so the
// day you're looking at keeps whatever you've typed but hasn't saved yet —
// each day refreshes the next time it's opened. The Dashboard's weekly habit
// ring is refreshed straight away, since it only reads saved numbers.
function markDaysStale(queryClient) {
  queryClient.invalidateQueries({ queryKey: KEY });
  queryClient.invalidateQueries({ queryKey: ['log'], refetchType: 'none' });
  queryClient.invalidateQueries({ queryKey: ['habitSummary'] });
}

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
    onSuccess: () => markDaysStale(queryClient),
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...habit }) => habitsApi.updateHabit(id, habit),
    onSuccess: () => markDaysStale(queryClient),
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: habitsApi.deleteHabit,
    onSuccess: () => markDaysStale(queryClient),
  });
}
