import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncHealthData } from '../native/healthSync.js';
import { useMe } from './useAuth.js';

// People already synced since the app was opened. Lives outside React so
// moving between screens (the home screen and the in-app pages use
// different layouts) never starts a second sync.
const startedFor = new Set();

// Inside the iOS app this pulls Apple Health data once per app open (and at
// most once a day); on the website it does nothing. Used by both the home
// screen and the shared in-app layout, so whichever the person lands on
// first starts it.
export function useHealthSync() {
  const { data: user } = useMe();
  const queryClient = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || startedFor.has(userId)) return;
    startedFor.add(userId);
    syncHealthData(userId).then((sent) => {
      if (!sent) return;
      // New readings arrived: refresh anything showing daily logs.
      queryClient.invalidateQueries({ queryKey: ['log'] });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['habitSummary'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
    });
  }, [userId, queryClient]);
}
