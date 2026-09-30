import { request } from './client.js';

// ---- Student side: this week's check-in ----
// `today` is this device's own day, so "this week" is the student's own
// Monday-to-Sunday week, not the server's.

// { hasCoach, coachName, weekStart, questions, checkin }
export function getCurrentCheckin(today) {
  return request(`/checkins/current?today=${today}`);
}

// body { mood, answers, notes } -> { checkin }
export function saveCurrentCheckin(today, body) {
  return request(`/checkins/current?today=${today}`, { method: 'PUT', body: JSON.stringify(body) });
}

// The student's own past check-ins, newest first -> { checkins }
export function getMyCheckins() {
  return request('/checkins');
}

// ---- Coach side ----

// -> { questions }
export function getCheckinQuestions() {
  return request('/coach/checkin-questions');
}

// -> { questions }
export function saveCheckinQuestions(questions) {
  return request('/coach/checkin-questions', { method: 'PUT', body: JSON.stringify({ questions }) });
}

// One client's check-ins -> { weekStart, checkins }. 404 when that person
// isn't (or is no longer) this coach's client.
export function getClientCheckins(clientId, today) {
  return request(`/coach/clients/${encodeURIComponent(clientId)}/checkins?today=${today}`);
}
