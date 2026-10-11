import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as measurementsApi from '../api/measurements.js';
import { localToday } from '../lib/localDate.js';
import { CLIENTS_KEY } from './useCoach.js';

// Saving the daily log (hooks/useLogs.js usePutLog) refreshes this key, so
// the charts pick up a new measurement straight away.
export const MEASUREMENTS_KEY = ['measurements'];
const CLIENT_MEASUREMENTS_KEY = ['coach', 'clientMeasurements'];

// The Progress chart covers the last 60 days; the coach sees 90.
export const MY_MEASUREMENT_DAYS = 60;
export const CLIENT_MEASUREMENT_DAYS = 90;

export function useMyMeasurements() {
  // The device's day is part of the key, so the window moves at midnight.
  const today = localToday();
  return useQuery({
    queryKey: [...MEASUREMENTS_KEY, MY_MEASUREMENT_DAYS, today],
    queryFn: async () =>
      (await measurementsApi.getMyMeasurements(MY_MEASUREMENT_DAYS, today))?.measurements ?? [],
  });
}

export function useClientMeasurements(clientId) {
  const queryClient = useQueryClient();
  const today = localToday();
  return useQuery({
    queryKey: [...CLIENT_MEASUREMENTS_KEY, clientId, today],
    queryFn: async () => {
      try {
        return (
          (await measurementsApi.getClientMeasurements(clientId, CLIENT_MEASUREMENT_DAYS, today))?.measurements ?? []
        );
      } catch (error) {
        // The connection ended: every screen that shows the link refreshes.
        if (error?.status === 404) {
          queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
          queryClient.invalidateQueries({ queryKey: ['clientSummary', clientId] });
        }
        throw error;
      }
    },
    enabled: Boolean(clientId),
    gcTime: 0,
    retry: (count, error) => error?.status !== 404 && count < 1,
  });
}
