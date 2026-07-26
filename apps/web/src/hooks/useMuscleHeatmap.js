import { useQuery } from '@tanstack/react-query';
import * as muscleHeatmapApi from '../api/muscleHeatmap.js';

export function useMuscleHeatmap(days) {
  return useQuery({
    queryKey: ['muscleHeatmap', days],
    queryFn: () => muscleHeatmapApi.getMuscleHeatmap({ days }),
  });
}
