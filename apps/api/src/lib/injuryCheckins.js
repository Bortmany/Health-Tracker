function clampPain(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n)));
}

function toNullableBoolean(value) {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

export function normalizeCheckin(raw) {
  return {
    injuryId: raw.injuryId,
    painPre: clampPain(raw.painPre),
    painDuring: clampPain(raw.painDuring),
    painPost: clampPain(raw.painPost),
    swelling: toNullableBoolean(raw.swelling),
    canTrainTomorrow: toNullableBoolean(raw.canTrainTomorrow),
  };
}

export function normalizeCheckins(rawList) {
  return (rawList ?? []).filter((c) => c?.injuryId).map(normalizeCheckin);
}
