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

// The native side of this plugin ships with @perfood/capacitor-healthkit,
// which gets installed when the iOS project is added on a Mac. Until then
// isPluginAvailable() is false and sync quietly does nothing.
const HealthKit = registerPlugin('CapacitorHealthkit');

const DAYS_TO_SYNC = 30;
const LAST_SYNC_KEY = 'cut-health-last-sync';

function dayKey(isoString) {
  return isoString.slice(0, 10);
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
  } catch {
    // The user may have denied access to this one metric — skip it.
    return [];
  }
}

// Turns raw HealthKit samples into one entry per day, in the exact shape
// the server's /api/health-sync endpoint expects.
export function buildDailyEntries({ weightSamples, stepSamples, energySamples, sleepSamples }) {
  const days = new Map();
  const day = (key) => {
    if (!days.has(key)) days.set(key, { date: key });
    return days.get(key);
  };

  // Weight: keep the most recent reading of each day.
  for (const s of weightSamples) {
    const d = day(dayKey(s.startDate));
    if (!d._weightAt || s.startDate > d._weightAt) {
      d.weight = Number(s.value);
      d._weightAt = s.startDate;
    }
  }

  // Steps and active calories: add up all readings in the day.
  for (const s of stepSamples) {
    const d = day(dayKey(s.startDate));
    d.steps = (d.steps ?? 0) + Math.round(Number(s.value));
  }
  for (const s of energySamples) {
    const d = day(dayKey(s.startDate));
    d.calories = (d.calories ?? 0) + Math.round(Number(s.value));
  }

  // Sleep: add up the hours of "asleep" periods, credited to the wake-up day.
  for (const s of sleepSamples) {
    const label = String(s.value ?? '').toUpperCase();
    if (label.includes('IN_BED') || label.includes('INBED') || label.includes('AWAKE')) continue;
    const hours = (new Date(s.endDate) - new Date(s.startDate)) / 3600000;
    if (!Number.isFinite(hours) || hours <= 0) continue;
    const d = day(dayKey(s.endDate));
    d.sleep = (d.sleep ?? 0) + hours;
  }

  return [...days.values()]
    .map(({ _weightAt, ...entry }) => ({
      ...entry,
      ...(entry.sleep != null ? { sleep: Math.round(entry.sleep * 10) / 10 } : {}),
    }))
    .filter((e) => e.weight != null || e.steps != null || e.calories != null || e.sleep != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function syncHealthData() {
  // Web browser or Android build without the plugin: do nothing.
  if (!Capacitor.isNativePlatform()) return;
  if (!Capacitor.isPluginAvailable('CapacitorHealthkit')) return;

  // Sync at most once per day so opening the app stays fast.
  const today = new Date().toISOString().slice(0, 10);
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
