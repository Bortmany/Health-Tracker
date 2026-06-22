import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as nutritionApi from '../api/nutrition.js';

export function useNutrition(date) {
  return useQuery({
    queryKey: ['nutrition', date],
    queryFn: () => nutritionApi.getNutrition(date),
    enabled: Boolean(date),
  });
}

export function useNutritionRange({ from, to } = {}) {
  return useQuery({
    queryKey: ['nutritionRange', from, to],
    queryFn: async () => (await nutritionApi.getNutritionRange({ from, to })).logs,
  });
}

export function usePutNutrition(date) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => nutritionApi.putNutrition(date, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition', date] });
      queryClient.invalidateQueries({ queryKey: ['nutritionRange'] });
    },
  });
}
