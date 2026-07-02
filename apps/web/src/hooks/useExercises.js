import { useQuery } from '@tanstack/react-query';
import * as exercisesApi from '../api/exercises.js';

export function useExercises(search) {
  return useQuery({
    queryKey: ['exercises', search],
    queryFn: async () => (await exercisesApi.getExercises({ search })).exercises,
  });
}
