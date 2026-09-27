import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as accountApi from '../api/account.js';
import { localToday } from '../lib/localDate.js';

// Fetches the full data export and hands the browser a file to download.
export function useExportData() {
  return useMutation({
    mutationFn: () => accountApi.exportData(localToday()),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cut-data-export-${localToday()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });
}

// Deletes the account, then clears every cached query so nothing personal
// lingers in memory after the user is gone.
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountApi.deleteAccount,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
