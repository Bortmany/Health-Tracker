import { ValidationError } from './validate.js';

// A pain score is optional, but if given it must be a real 0-10 number — not
// silently clamped into range, since a clamped value can hide a client bug
// (e.g. a stray "13") behind a plausible-looking 10.
function cleanPainScore(value, name) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ValidationError(`${name} must be a number between 0 and 10`);
  }
  if (n < 0 || n > 10) {
    throw new ValidationError(`${name} must be between 0 and 10`);
  }
  return Math.round(n);
}

// A tri-state flag: null/undefined/'' means "not answered"; anything else
// must be an actual boolean, not a string or number standing in for one.
function cleanFlag(value, name) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be true or false`);
  }
  return value;
}

export function normalizeCheckin(raw) {
  return {
    injuryId: raw.injuryId,
    painPre: cleanPainScore(raw.painPre, 'pain pre'),
    painDuring: cleanPainScore(raw.painDuring, 'pain during'),
    painPost: cleanPainScore(raw.painPost, 'pain post'),
    swelling: cleanFlag(raw.swelling, 'swelling'),
    canTrainTomorrow: cleanFlag(raw.canTrainTomorrow, 'can train tomorrow'),
  };
}

export function normalizeCheckins(rawList) {
  return (rawList ?? []).filter((c) => c?.injuryId).map(normalizeCheckin);
}
