import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as plansApi from '../api/plans.js';
import { localToday } from '../lib/localDate.js';

export function useTemplates(filters = {}) {
  return useQuery({
    queryKey: ['planTemplates', filters.goal, filters.experience, filters.equipment],
    queryFn: async () => (await plansApi.getTemplates(filters)).templates,
  });
}

export function useRecommendedTemplates() {
  return useQuery({
    queryKey: ['recommendedTemplates'],
    queryFn: async () => (await plansApi.getRecommendedTemplates()).templates,
  });
}

export function useMyPlan() {
  // Part of the key, so the week number refreshes once the device passes midnight.
  const today = localToday();
  return useQuery({
    queryKey: ['myPlan', today],
    queryFn: async () => (await plansApi.getMyPlan(today)).plan,
  });
}

export function useAdoptTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => plansApi.adoptTemplate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myPlan'] });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
    },
  });
}

export function useDeleteMyPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: plansApi.deleteMyPlan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['myPlan'] }),
  });
}
