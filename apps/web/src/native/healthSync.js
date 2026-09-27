// Apple Health sync — only does anything inside the real iOS app.
//
// On the website and the home-screen web app this file is a no-op: Apple
// only lets health data be read on-device, so the browser can never see it.
// Inside the Capacitor iOS app, the HealthKit plugin (added during the Mac
// build step — see docs/mobile.md) reads the last 30 days of weight, steps,
// active calories and sleep, and pushes them to POST /api/health-sync.
// The server only fills in blanks; it never overwrites anything typed by hand.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { request } from '../api/client.js';
import { buildDailyEntries, localToday } from './healthDays.js';

export { buildDailyEntries };

// The native side of this plugin ships with @perfood/capacitor-healthkit,
// which gets installed when the iOS project is added on a Mac. Until then
// isPluginAvailable() is false and sync quietly does nothing.
const HealthKit = registerPlugin('CapacitorHealthkit');

const DAYS_TO_SYNC = 30;
const LAST_SYNC_KEY = 'cut-health-last-sync';

async function querySamples(sampleName, startDate, endDate) {
  try {
    const result = await HealthKit.queryHKitSampleType({
      sampleName,
      startDate,
      endDate,
      limit: 0,
    });
    return result?.resultData ?? [];
  } catch {
    // The user may have denied access to this one metric — skip it.
    return [];
  }
}

export async function syncHealthData() {
  // Web browser or Android build without the plugin: do nothing.
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable('CapacitorHealthkit')) return;

  // Sync at most once per day so opening the app stays fast. "Today" is the
  // phone's own day (Oman time for Oman users), never the UTC day.
  const today = localToday();
  if (localStorage.getItem(LAST_SYNC_KEY) === today) return;

  try {
    await HealthKit.requestAuthorization({
      all: [],
      write: [],
      read: ['weight', 'stepCount', 'activeEnergyBurned', 'sleepAnalysis'],
    });

    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - DAYS_TO_SYNC * 24 * 3600000).toISOString();

    const [weightSamples, stepSamples, energySamples, sleepSamples] = await Promise.all([
      querySamples('weight', startDate, endDate),
      querySamples('stepCount', startDate, endDate),
      querySamples('activeEnergyBurned', startDate, endDate),
      querySamples('sleepAnalysis', startDate, endDate),
    ]);

    const entries = buildDailyEntries({ weightSamples, stepSamples, energySamples, sleepSamples });
    if (entries.length === 0) {
      localStorage.setItem(LAST_SYNC_KEY, today);
      return;
    }

    await request('/health-sync', {
      method: 'POST',
      body: JSON.stringify({ entries: entries.slice(-90) }),
    });
    localStorage.setItem(LAST_SYNC_KEY, today);
  } catch {
    // Never let a failed sync break the app — we just try again tomorrow.
  }
}
