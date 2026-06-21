import { request } from './client.js';

export function getHabits() {
  return request('/habits');
}

export function createHabit(habit) {
  return request('/habits', { method: 'POST', body: JSON.stringify(habit) });
}

export function updateHabit(id, habit) {
  return request(`/habits/${id}`, { method: 'PUT', body: JSON.stringify(habit) });
}

export function deleteHabit(id) {
  return request(`/habits/${id}`, { method: 'DELETE' });
}
