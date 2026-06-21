function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toNullableInt(value) {
  const n = toNullableNumber(value);
  return n === null ? null : Math.round(n);
}

export function normalizeExercises(rawExercises) {
  return (rawExercises ?? [])
    .filter((ex) => ex?.name)
    .map((ex, index) => ({
      name: ex.name,
      sortOrder: ex.sortOrder ?? index,
      sets: (ex.sets ?? []).map((set, setIndex) => ({
        setNumber: set.setNumber ?? setIndex + 1,
        weight: toNullableNumber(set.weight),
        reps: toNullableInt(set.reps),
        rpe: toNullableNumber(set.rpe),
      })),
    }));
}
