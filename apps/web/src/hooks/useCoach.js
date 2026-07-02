import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as coachApi from '../api/coach.js';

const CLIENTS_KEY = ['coachClients'];
const MY_COACH_KEY = ['myCoach'];

export function useClients() {
  return useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: coachApi.getClients,
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.createInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useRemoveClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.removeClient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
  });
}

export function useClientSummary(clientId) {
  return useQuery({
    queryKey: ['clientSummary', clientId],
    queryFn: () => coachApi.getClientSummary(clientId),
    enabled: Boolean(clientId),
  });
}

export function useAssignProgram(clientId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (program) => coachApi.assignProgram(clientId, program),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientSummary', clientId] }),
  });
}

export function useMyCoach() {
  return useQuery({
    queryKey: MY_COACH_KEY,
    queryFn: async () => (await coachApi.getMyCoach()).coach,
  });
}

export function useRedeemCoachCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.redeemCoachCode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_COACH_KEY });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
    },
  });
}

export function useRemoveMyCoach() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: coachApi.removeMyCoach,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_COACH_KEY });
      queryClient.invalidateQueries({ queryKey: ['programs'] });
    },
  });
}
