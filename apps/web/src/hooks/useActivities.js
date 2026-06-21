import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as activitiesApi from '../api/activities.js';

const KEY = ['activities'];

export function useActivities() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await activitiesApi.getActivities()).activities,
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: activitiesApi.createActivity,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...activity }) => activitiesApi.updateActivity(id, activity),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: activitiesApi.deleteActivity,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
