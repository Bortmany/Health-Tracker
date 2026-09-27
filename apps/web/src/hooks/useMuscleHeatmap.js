import { useQuery } from '@tanstack/react-query';
import * as muscleHeatmapApi from '../api/muscleHeatmap.js';
import { localToday } from '../lib/localDate.js';

export function useMuscleHeatmap(days) {
  // Part of the key, so the map refreshes once the device passes midnight.
  const today = localToday();
  return useQuery({
    queryKey: ['muscleHeatmap', days, today],
    queryFn: () => muscleHeatmapApi.getMuscleHeatmap({ days, today }),
  });
}
