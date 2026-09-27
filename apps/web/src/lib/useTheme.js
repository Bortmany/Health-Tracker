import { useSyncExternalStore } from 'react';
import { readToken } from './theme.js';

// The light/dark setting, kept on the device only (no account setting, no
// server call). The matching snippet in index.html applies the saved choice
// before the first paint so the app never flashes the wrong colours; this
// file keeps the rest of the app in step after that.

const STORAGE_KEY = 'cut-theme';
// Cut has always been dark, so a device with nothing saved stays dark.
const DEFAULT_SETTING = 'dark';

export const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const darkQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function readStoredSetting() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEME_OPTIONS.some((o) => o.value === saved) ? saved : DEFAULT_SETTING;
  } catch {
    // Private browsing can block storage — fall back to the usual look.
    return DEFAULT_SETTING;
  }
}

// "System" means: whatever the phone or computer is set to right now.
function resolveSetting(setting) {
  if (setting !== 'system') return setting;
  return darkQuery && !darkQuery.matches ? 'light' : 'dark';
}

function applyResolved(resolved) {
  const root = document.documentElement;
  if (resolved === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;

  // Read the page background straight off the design tokens (after the
  // switch above) so the phone's browser bar matches — that way the colour
  // is never written down in two places.
  const meta = document.querySelector('meta[name="theme-color"]');
  const background = readToken('--color-bg');
  if (meta && background) meta.setAttribute('content', background);
}

const initialSetting = readStoredSetting();
let state = { setting: initialSetting, resolved: resolveSetting(initialSetting) };

const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function update(setting) {
  state = { setting, resolved: resolveSetting(setting) };
  applyResolved(state.resolved);
  for (const listener of listeners) listener();
}

// Called once when the app starts, so the browser-bar colour is right even
// if nobody opens the appearance setting.
export function initTheme() {
  applyResolved(state.resolved);
}

export function setTheme(setting) {
  const next = THEME_OPTIONS.some((o) => o.value === setting) ? setting : DEFAULT_SETTING;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Nothing saved — the choice still applies for this visit.
  }
  update(next);
}

// While the setting is "System", follow the device flipping between light
// and dark (some phones do this automatically at sunset).
darkQuery?.addEventListener('change', () => {
  if (state.setting === 'system') update('system');
});

// Returns the chosen setting ('light' | 'dark' | 'system'), the look that
// actually ended up on screen ('light' | 'dark'), and the setter.
export function useTheme() {
  const { setting, resolved } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { setting, resolved, setTheme };
}
