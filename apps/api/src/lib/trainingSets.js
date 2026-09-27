import * as validate from './validate.js';

// Guards against a runaway request stuffing a session with thousands of rows.
const MAX_EXERCISES = 50;
const MAX_SETS_PER_EXERCISE = 50;

// Cleans and validates the exercises a training session was logged with. Every
// weight/reps/RPE is optional, but if given it must be a finite, non-negative
// number inside a sane range — so text, NaN, Infinity (e.g. 1e400) and negative
// reps (which used to sneak in as a fake personal record) are rejected with a
// clean 400 instead of corrupting the data. Rows without a name are skipped
// (the form can send blank rows).
export function normalizeExercises(rawExercises) {
  const list = rawExercises ?? [];
  if (!Array.isArray(list)) {
    throw new validate.ValidationError('exercises must be a list');
  }
  if (list.length > MAX_EXERCISES) {
    throw new validate.ValidationError(`You can log at most ${MAX_EXERCISES} exercises in one session`);
  }

  const result = [];
  for (const [index, ex] of list.entries()) {
    if (ex?.name == null || String(ex.name).trim() === '') continue;

    const sets = ex.sets ?? [];
    if (!Array.isArray(sets)) {
      throw new validate.ValidationError('sets must be a list');
    }
    if (sets.length > MAX_SETS_PER_EXERCISE) {
      throw new validate.ValidationError(`You can log at most ${MAX_SETS_PER_EXERCISE} sets for one exercise`);
    }

    result.push({
      name: validate.stringLength(ex.name, 'exercise name', { max: 200 }),
      sortOrder: validate.nonNegativeNumber(ex.sortOrder ?? index, 'exercise order', { integer: true, max: 10000 }),
      sets: sets.map((set, setIndex) => {
        // A null or non-object item in the sets list (e.g. [null] or ["x"])
        // would otherwise crash when we read set.weight — reject it cleanly.
        if (set == null || typeof set !== 'object') {
          throw new validate.ValidationError('each set must be a set of numbers');
        }
        return {
          setNumber: validate.nonNegativeNumber(set.setNumber ?? setIndex + 1, 'set number', { integer: true, max: 1000 }),
          weight: validate.nonNegativeNumber(set.weight, 'set weight', { optional: true, max: 10000 }),
          reps: validate.nonNegativeNumber(set.reps, 'set reps', { optional: true, integer: true, max: 10000 }),
          rpe: validate.nonNegativeNumber(set.rpe, 'set RPE', { optional: true, max: 10 }),
        };
      }),
    });
  }
  return result;
}
