// The AI plan writer. Asleep until an Anthropic API key is added to the server
// (ANTHROPIC_API_KEY env var). When it is set, paid accounts can have a plan
// written from their quiz answers and adjusted once a week from their logs.
//
// Only quiz answers, training logs, weigh-ins and recovery (sleep, steps,
// injuries) are ever sent — never food data, notes or anything that names
// the person.

import Anthropic from '@anthropic-ai/sdk';

// The current Opus model (checked against the claude-api guide, Sep 2026).
const MODEL = 'claude-opus-5-5';

export function isAiPlanGenerationEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'description', 'days', 'progression', 'phases'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'exercises'],
        properties: {
          name: { type: 'string' },
          exercises: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'targetSets', 'targetReps'],
              properties: {
                name: { type: 'string' },
                targetSets: { type: 'integer' },
                targetReps: { type: 'integer' },
              },
            },
          },
        },
      },
    },
    progression: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        type: { type: 'string', enum: ['weight', 'reps', 'time'] },
        weightPct: { type: 'number' },
        repStep: { type: 'integer' },
        minutesStep: { type: 'integer' },
        deloadEveryWeeks: { type: 'integer' },
      },
    },
    phases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'weeks', 'focus'],
        properties: {
          name: { type: 'string' },
          weeks: { type: 'integer' },
          focus: { type: 'string' },
        },
      },
    },
  },
};

const ADJUSTMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changes'],
  properties: {
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['day', 'exercise', 'action', 'note'],
        properties: {
          day: { type: 'string' },
          exercise: { type: 'string' },
          action: { type: 'string', enum: ['add', 'remove', 'change'] },
          targetSets: { type: 'integer' },
          targetReps: { type: 'integer' },
          note: { type: 'string' },
        },
      },
    },
  },
};

const COACH_SYSTEM_PROMPT =
  'You are a strength and conditioning coach with 20 years of client experience. ' +
  'You write safe, progressive, realistic training plans: no ego lifting, no junk volume, ' +
  'deloads where they belong, and beginner plans a genuine beginner can actually finish. ' +
  'Use common gym names for exercises ("Romanian deadlift", not abbreviations).';

// The longest one AI call may take, retry included. Kept well under the
// window in routes/plans.js during which a started plan-write blocks a second
// one, so two requests can never both reach the AI.
export const AI_CALL_TIMEOUT_MS = 2 * 60 * 1000;

// One call to Claude that must come back as JSON matching `schema`.
async function askForJson({ system, prompt, schema }) {
  const client = new Anthropic({ timeout: AI_CALL_TIMEOUT_MS, maxRetries: 1 });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The AI plan writer declined this request.');
  }
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('The AI plan writer sent back no plan.');
  return JSON.parse(text);
}

function describeAnswers(answers) {
  return (
    `- Age: ${answers.age ?? 'unknown'}\n` +
    `- Experience: ${answers.experienceLevel ?? 'unknown'}\n` +
    `- Goal: ${answers.trainingGoal ?? 'general fitness'}\n` +
    `- Equipment: ${answers.equipment ?? 'unknown'}\n` +
    `- Days per week they can train: ${answers.daysPerWeek ?? 3}\n`
  );
}

// Returns a plan in the same shape as a library template, so callers can
// treat AI-written and library plans the same way.
export async function generateAiPlan(answers, durationWeeks) {
  return askForJson({
    system: COACH_SYSTEM_PROMPT,
    schema: PLAN_SCHEMA,
    prompt:
      `Write a ${durationWeeks}-week training plan for this person:\n` +
      describeAnswers(answers) +
      'Return one repeating training week (the "days" array), progression rules for how it ' +
      `advances week to week, and phases whose weeks add up to ${durationWeeks}.`,
  });
}

// Looks at one week of training and recovery and decides next week's changes.
// Returns { summary, changes: [{ day, exercise, action, targetSets, targetReps, note }] }.
export async function adjustAiPlan({ answers, currentPlan, weekNumber, trainingLogs, weighIns, recovery }) {
  return askForJson({
    system:
      COACH_SYSTEM_PROMPT +
      ' Each week you review how the last week went and make small, sensible changes to the ' +
      'coming week. Change little when training went well; ease off where sleep was poor, ' +
      'sessions were missed or an injury hurts. Never add an exercise that loads an injured area.',
    schema: ADJUSTMENT_SCHEMA,
    prompt:
      `This person is starting week ${weekNumber} of their plan.\n` +
      `Their quiz answers:\n${describeAnswers(answers)}\n` +
      `Their current training week (JSON):\n${JSON.stringify(currentPlan)}\n\n` +
      `Workouts logged in the last 7 days (JSON):\n${JSON.stringify(trainingLogs)}\n\n` +
      `Weigh-ins in the last 7 days (JSON):\n${JSON.stringify(weighIns)}\n\n` +
      `Recovery in the last 7 days — sleep hours, steps, injury check-ins (JSON):\n${JSON.stringify(recovery)}\n\n` +
      'Return a one-sentence summary in plain English that a non-expert understands ' +
      '(for example "Added a set to squats; easier week for legs") and a list of changes. ' +
      'Use the exact day names and exercise names from the current training week. ' +
      '"change" updates the sets/reps of an existing exercise, "add" puts a new exercise on a day, ' +
      '"remove" takes one off. An empty list is fine if nothing should change.',
  });
}

// The writer the routes use. Tests swap in a fake with setAiPlanWriter so the
// test suite never calls Anthropic; resetAiPlanWriter puts the real one back.
const realWriter = { generate: generateAiPlan, adjust: adjustAiPlan };
let currentWriter = realWriter;

export function aiPlanWriter() {
  return currentWriter;
}

export function setAiPlanWriter(writer) {
  currentWriter = { ...realWriter, ...writer };
}

export function resetAiPlanWriter() {
  currentWriter = realWriter;
}

// --- Cleaning what the AI sends back -----------------------------------
// Whatever the writer returns is treated like user input: trimmed, capped and
// checked before anything is saved. A reply that can't be used throws, and the
// caller treats that the same as the AI failing.

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

function cleanInt(value, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  return Math.min(Math.max(n, min), max);
}

export function cleanAiPlan(plan) {
  const name = cleanText(plan?.name, 100);
  const days = (Array.isArray(plan?.days) ? plan.days : []).slice(0, 7).map((day, i) => ({
    name: cleanText(day?.name, 100) ?? `Day ${i + 1}`,
    exercises: (Array.isArray(day?.exercises) ? day.exercises : [])
      .slice(0, 15)
      .map((ex) => ({
        name: cleanText(ex?.name, 100),
        targetSets: cleanInt(ex?.targetSets, 1, 20),
        targetReps: cleanInt(ex?.targetReps, 1, 100),
      }))
      .filter((ex) => ex.name),
  })).filter((day) => day.exercises.length > 0);

  if (!name || days.length === 0) throw new Error('The AI plan came back without usable training days.');

  const p = plan.progression && typeof plan.progression === 'object' ? plan.progression : {};
  const progression = { type: ['weight', 'reps', 'time'].includes(p.type) ? p.type : 'reps' };
  if (Number.isFinite(Number(p.weightPct))) progression.weightPct = Math.min(Math.max(Number(p.weightPct), 0), 10);
  for (const key of ['repStep', 'minutesStep', 'deloadEveryWeeks']) {
    const n = cleanInt(p[key], 0, 12);
    if (n != null) progression[key] = n;
  }

  const phases = (Array.isArray(plan.phases) ? plan.phases : []).slice(0, 12).map((phase) => ({
    name: cleanText(phase?.name, 100) ?? 'Phase',
    weeks: cleanInt(phase?.weeks, 1, 52) ?? 1,
    focus: cleanText(phase?.focus, 300) ?? '',
  }));

  return { name, description: cleanText(plan.description, 1000) ?? '', days, progression, phases };
}

export function cleanAiAdjustment(adjustment) {
  const summary = cleanText(adjustment?.summary, 500);
  if (!summary) throw new Error('The AI adjustment came back without a summary.');
  const changes = (Array.isArray(adjustment?.changes) ? adjustment.changes : [])
    .slice(0, 30)
    .map((c) => ({
      day: cleanText(c?.day, 100),
      exercise: cleanText(c?.exercise, 100),
      action: ['add', 'remove', 'change'].includes(c?.action) ? c.action : null,
      targetSets: cleanInt(c?.targetSets, 1, 20),
      targetReps: cleanInt(c?.targetReps, 1, 100),
      note: cleanText(c?.note, 300) ?? '',
    }))
    .filter((c) => c.day && c.exercise && c.action);
  return { summary, changes };
}
