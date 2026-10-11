import { request } from './client.js';

// Body measurements are saved with the daily log (api/logs.js putLog); these
// only read them for the charts. Each reply is
// { measurements: [{ date, waist, chest, arms, hips, thighs, neck }] }, oldest
// first. `today` is this device's own day.

export function getMyMeasurements(days, today) {
  return request(`/measurements?days=${days}&today=${today}`);
}

// 404 when this person isn't (or is no longer) this coach's client.
export function getClientMeasurements(clientId, days, today) {
  return request(`/coach/clients/${encodeURIComponent(clientId)}/measurements?days=${days}&today=${today}`);
}
