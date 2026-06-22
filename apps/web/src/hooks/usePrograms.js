import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as programsApi from '../api/programs.js';

const KEY = ['programs'];

export function usePrograms() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await programsApi.getPrograms()).programs,
  });
}

export function useActivePrograms() {
  const { data, ...rest } = usePrograms();
  return { data: data?.filter((p) => !p.archivedAt), ...rest };
}

export function useProgram(id) {
  return useQuery({
    queryKey: ['program', id],
    queryFn: async () => (await programsApi.getProgram(id)).program,
    enabled: Boolean(id),
  });
}

export function useCreateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: programsApi.createProgram,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...program }) => programsApi.updateProgram(id, program),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: programsApi.deleteProgram,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
