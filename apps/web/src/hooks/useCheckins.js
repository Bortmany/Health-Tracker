import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as checkinsApi from '../api/checkins.js';
import { localToday } from '../lib/localDate.js';
import { CLIENTS_KEY, MY_COACH_KEY } from './useCoach.js';

export const CHECKIN_CURRENT_KEY = ['checkin', 'current'];
export const MY_CHECKINS_KEY = ['checkins'];
export const CHECKIN_QUESTIONS_KEY = ['coach', 'checkinQuestions'];
const CLIENT_SUMMARY_KEY = ['clientSummary'];

// Every screen that shows a check-in (the Today card, the form, the student's
// history, the coach's list and summary) reads one of these keys, so a new or
// edited check-in never leaves a stale copy anywhere.
function invalidateCheckinKeys(queryClient) {
  queryClient.invalidateQueries({ queryKey: CHECKIN_CURRENT_KEY });
  queryClient.invalidateQueries({ queryKey: MY_CHECKINS_KEY });
  queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
  queryClient.invalidateQueries({ queryKey: CLIENT_SUMMARY_KEY });
}

// This week's check-in for the signed-in student. The device's day is part
// of the key, so a new week starts the moment the device passes Sunday night.
export function useCurrentCheckin(options = {}) {
  const today = localToday();
  return useQuery({
    queryKey: [...CHECKIN_CURRENT_KEY, today],
    queryFn: () => checkinsApi.getCurrentCheckin(today),
    ...options,
  });
}

export function useSaveCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => checkinsApi.saveCurrentCheckin(localToday(), body),
    onSuccess: () => invalidateCheckinKeys(queryClient),
    onError: (error) => {
      // The coaching link ended while the form was open: refresh who the
      // coach is, so every screen stops offering the check-in.
      // The coach changed their questions while the form was open: fetch the
      // new list so the form shows what will actually be asked.
      if (error?.code === 'QUESTIONS_CHANGED') {
        queryClient.invalidateQueries({ queryKey: CHECKIN_CURRENT_KEY });
      }
      if (error?.code === 'NO_COACH') {
        queryClient.invalidateQueries({ queryKey: MY_COACH_KEY });
        queryClient.invalidateQueries({ queryKey: CHECKIN_CURRENT_KEY });
      }
    },
  });
}

// ---- Coach side ----

export function useCheckinQuestions() {
  return useQuery({
    queryKey: CHECKIN_QUESTIONS_KEY,
    queryFn: async () => (await checkinsApi.getCheckinQuestions())?.questions ?? [],
  });
}

export function useSaveCheckinQuestions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checkinsApi.saveCheckinQuestions,
    onSuccess: (result) => {
      if (Array.isArray(result?.questions)) {
        queryClient.setQueryData(CHECKIN_QUESTIONS_KEY, result.questions);
      }
      queryClient.invalidateQueries({ queryKey: CHECKIN_QUESTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: CHECKIN_CURRENT_KEY });
    },
  });
}
