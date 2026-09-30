import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as plansApi from '../api/plans.js';
import { localToday } from '../lib/localDate.js';

const HISTORY_KEY = ['aiPlanHistory'];

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

// One request feeds both the plan and the AI plan switches (useAiPlanStatus),
// so they always agree. The weekly adjustment happens on the server inside
// this request, so it can take longer the one time it runs.
function useMyPlanQuery(select) {
  const queryClient = useQueryClient();
  // Part of the key, so the week number refreshes once the device passes midnight.
  const today = localToday();
  return useQuery({
    queryKey: ['myPlan', today],
    queryFn: async () => {
      const previousId = queryClient.getQueryData(['myPlan', today])?.plan?.latestAdjustment?.id ?? null;
      const data = await plansApi.getMyPlan(today);
      // A new adjustment means a new history row — refresh the history only
      // when the newest adjustment is one we haven't seen yet.
      const latestId = data?.plan?.latestAdjustment?.id ?? null;
      if (latestId && latestId !== previousId) queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
      return data;
    },
    select,
  });
}

export function useMyPlan() {
  return useMyPlanQuery((data) => data?.plan ?? null);
}

// { enabled, paid } — whether the AI is switched on and whether this member
// has the paid plan. Both false until the server says otherwise.
export function useAiPlanStatus() {
  return useMyPlanQuery((data) => ({
    enabled: Boolean(data?.aiPlan?.enabled),
    paid: Boolean(data?.aiPlan?.paid),
  }));
}

// Loads only once `enabled` is true (the history panel has been opened).
export function useAiPlanHistory(enabled = true) {
  return useQuery({
    queryKey: HISTORY_KEY,
    queryFn: async () => (await plansApi.getAiPlanHistory()).adjustments ?? [],
    enabled,
  });
}

// A new plan means a new program too: refresh the plan, the programs list
// and every program detail.
function invalidatePlanAndPrograms(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['myPlan'] });
  queryClient.invalidateQueries({ queryKey: ['programs'] });
  queryClient.invalidateQueries({ queryKey: ['program'] });
}

export function useAdoptTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => plansApi.adoptTemplate(id, payload),
    onSuccess: () => invalidatePlanAndPrograms(queryClient),
  });
}

export const CREATE_AI_PLAN_KEY = ['createAiPlan'];

export function useCreateAiPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: CREATE_AI_PLAN_KEY,
    mutationFn: () => plansApi.createAiPlan(localToday(), { startDate: localToday() }),
    onSuccess: () => {
      invalidatePlanAndPrograms(queryClient);
      queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
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
