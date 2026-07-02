// The "veteran trainer" matching engine: scores the curated template library
// against a person's quiz answers, and turns a template's progression rules
// into plain-English weekly targets.

const EQUIPMENT_LEVELS = { none: 0, minimal: 1, full_gym: 2 };
const EXPERIENCE_LEVELS = { beginner: 0, intermediate: 1, advanced: 2 };

// Higher score = better fit. Returns null when the plan simply can't work
// for this person (needs equipment they don't have, or is outside their age range).
export function scoreTemplate(template, answers) {
  const userEquipment = EQUIPMENT_LEVELS[answers.equipment] ?? 2;
  const planEquipment = EQUIPMENT_LEVELS[template.equipment] ?? 0;
  if (planEquipment > userEquipment) return null;

  if (answers.age != null) {
    if (template.min_age != null && answers.age < template.min_age) return null;
    if (template.max_age != null && answers.age > template.max_age) return null;
  }

  let score = 0;

  if (answers.trainingGoal && template.goal === answers.trainingGoal) score += 40;
  else if (template.goal === 'general') score += 10;

  const userExp = EXPERIENCE_LEVELS[answers.experienceLevel];
  const planExp = EXPERIENCE_LEVELS[template.experience];
  if (userExp != null) {
    const gap = Math.abs(userExp - planExp);
    if (gap === 0) score += 25;
    else if (gap === 1) score += 8;
    // A plan two levels off (beginner vs advanced) gets nothing.
  }

  if (answers.daysPerWeek != null) {
    score -= Math.abs(template.days_per_week - answers.daysPerWeek) * 6;
  }

  // Prefer plans that use what the person has rather than much less.
  if (planEquipment === userEquipment) score += 10;

  return score;
}

export function rankTemplates(templates, answers) {
  return templates
    .map((t) => ({ template: t, score: scoreTemplate(t, answers) }))
    .filter((r) => r.score != null)
    .sort((a, b) => b.score - a.score);
}

// Which phase of a long plan a given week falls in, e.g. "Foundation" weeks 1-8.
export function phaseForWeek(phases, weekNumber) {
  if (!Array.isArray(phases) || phases.length === 0) return null;
  let start = 1;
  for (const phase of phases) {
    const weeks = Number(phase.weeks) || 0;
    if (weekNumber < start + weeks) return { name: phase.name, focus: phase.focus };
    start += weeks;
  }
  return { name: phases.at(-1).name, focus: phases.at(-1).focus };
}

// Plain-English instructions for the given week, derived from the plan's rules.
export function weekTargets({ progression = {}, phases = [] }, weekNumber, durationWeeks) {
  const deloadEvery = Number(progression.deloadEveryWeeks) || 0;
  const deload = deloadEvery > 0 && weekNumber % deloadEvery === 0;
  const phase = durationWeeks > 4 ? phaseForWeek(phases, weekNumber) : null;

  let guidance;
  if (deload) {
    guidance = 'Easy week. Use about 60% of your usual weights or effort and focus on clean form and recovery.';
  } else if (progression.type === 'weight') {
    guidance = `Add about ${progression.weightPct ?? 2.5}% to your working weights compared with last week. If a set felt hard to finish, keep the same weight one more week.`;
  } else if (progression.type === 'reps') {
    guidance = `Try to do ${progression.repStep ?? 1} more rep per set than last week. When you hit the top of the rep range on every set, move to a harder version of the exercise.`;
  } else if (progression.type === 'time') {
    guidance = `Add about ${progression.minutesStep ?? 2} minutes to each session compared with last week. Keep a pace where you could still hold a conversation.`;
  } else {
    guidance = 'Repeat last week and aim for slightly better quality on every set.';
  }

  return { weekNumber, deload, phase, guidance };
}
