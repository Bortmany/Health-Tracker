// Apple Health sync — only does anything inside the real iOS app.
//
// On the website and the home-screen web app this file is a no-op: Apple
// only lets health data be read on-device, so the browser can never see it.
// Inside the Capacitor iOS app, the HealthKit plugin (added during the Mac
// build step — see docs/mobile.md) reads the last 30 days of weight, steps,
// active calories and sleep, and pushes them to POST /api/health-sync.
// The server only fills in blanks; it never overwrites anything typed by hand.
// Because of that, only finished days (before the phone's today) are sent:
// a half-finished day would get stuck at its morning numbers. Each sync
// re-sends the whole last 30 finished days, so a day that was still empty
// last time (for example the Watch hadn't handed over its data yet) gets
// filled in on a later sync.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { request } from '../api/client.js';
import { buildDailyEntries, localDayKey, localToday } from './healthDays.js';

export { buildDailyEntries };

// The native side of this plugin ships with @perfood/capacitor-healthkit,
// which gets installed when the iOS project is added on a Mac. Until then
// isPluginAvailable() is false and sync quietly does nothing.
const HealthKit = registerPlugin('CapacitorHealthkit');

const DAYS_TO_SYNC = 30;

// Remembered per signed-in person, so a second account on the same phone
// still gets its own sync on the same day.
function lastSyncKey(userId) {
  return `cut-health-last-sync:${userId}`;
}

// Failures never break the app, but they must not vanish either: a developer
// looking at the Xcode / Safari console sees exactly what went wrong.
function logProblem(what, err) {
  console.warn(`[health-sync] ${what}:`, err);
}

async function querySamples(sampleName, startDate, endDate) {
  try {
    const result = await HealthKit.queryHKitSampleType({
      sampleName,
      startDate,
      endDate,
      limit: 0,
    });
    return result?.resultData ?? [];
  } catch (err) {
    // The user may have denied access to this one metric — skip it.
    logProblem(`could not read ${sampleName}`, err);
    return [];
  }
}

// Returns true when new readings were sent to the server.
export async function syncHealthData(userId) {
  // Web browser or Android build without the plugin: do nothing.
  if (!userId) return false;
  if (!Capacitor.isNativePlatform()) return false;
  if (!Capacitor.isPluginAvailable('CapacitorHealthkit')) return false;

  // Sync at most once per day so opening the app stays fast. "Today" is the
  // phone's own day (Oman time for Oman users), never the UTC day.
  const today = localToday();
  const syncKey = lastSyncKey(userId);
  if (localStorage.getItem(syncKey) === today) return false;

  try {
    await HealthKit.requestAuthorization({
      all: [],
      write: [],
      read: ['weight', 'stepCount', 'activeEnergyBurned', 'sleepAnalysis'],
    });

    // Up to midnight this morning, on the phone's clock. Reading starts one
    // extra day back so a night's sleep that began before the first day is
    // seen in full; that extra, half-covered day itself is not sent.
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS_TO_SYNC);
    const startDate = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() - 1).toISOString();
    const from = localDayKey(firstDay);

    const [weightSamples, stepSamples, energySamples, sleepSamples] = await Promise.all([
      querySamples('weight', startDate, endDate),
      querySamples('stepCount', startDate, endDate),
      querySamples('activeEnergyBurned', startDate, endDate),
      querySamples('sleepAnalysis', startDate, endDate),
    ]);

    const entries = buildDailyEntries({ weightSamples, stepSamples, energySamples, sleepSamples, from, today });
    if (entries.length === 0) {
      localStorage.setItem(syncKey, today);
      return false;
    }

    await request('/health-sync', {
      method: 'POST',
      body: JSON.stringify({ entries: entries.slice(-90) }),
    });
    localStorage.setItem(syncKey, today);
    return true;
  } catch (err) {
    // Never let a failed sync break the app. The day isn't marked as done,
    // so the next app open tries again.
    logProblem('sync failed', err);
    return false;
  }
}
