import { request } from './client.js';

export function getPrograms() {
  return request('/programs');
}

export function createProgram(program) {
  return request('/programs', { method: 'POST', body: JSON.stringify(program) });
}

export function getProgram(id) {
  return request(`/programs/${id}`);
}

export function updateProgram(id, program) {
  return request(`/programs/${id}`, { method: 'PUT', body: JSON.stringify(program) });
}

export function deleteProgram(id) {
  return request(`/programs/${id}`, { method: 'DELETE' });
}
