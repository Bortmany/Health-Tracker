import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as injuriesApi from '../api/injuries.js';

const KEY = ['injuries'];

export function useInjuries() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await injuriesApi.getInjuries()).injuries,
  });
}

export function useActiveInjuries() {
  const { data, ...rest } = useInjuries();
  return { data: data?.filter((i) => !i.archivedAt), ...rest };
}

export function useCreateInjury() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: injuriesApi.createInjury,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateInjury() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...injury }) => injuriesApi.updateInjury(id, injury),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
