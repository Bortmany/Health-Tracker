// Dormant AI plan generator. When an Anthropic API key is added to the server
// (ANTHROPIC_API_KEY env var), the plan routes can use this to write a fully
// personalized plan instead of picking from the template library. Until then
// it is never called — activating it later is config, not code.

import Anthropic from '@anthropic-ai/sdk';

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

// Returns a plan in the same shape as a library template, so callers can
// treat AI-generated and library plans identically.
export async function generateAiPlan(answers, durationWeeks) {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    system:
      'You are a strength and conditioning coach with 20 years of client experience. ' +
      'You write safe, progressive, realistic training plans: no ego lifting, no junk volume, ' +
      'deloads where they belong, and beginner plans a genuine beginner can actually finish. ' +
      'Use common gym names for exercises ("Romanian deadlift", not abbreviations).',
    output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `Write a ${durationWeeks}-week training plan for this person:\n` +
          `- Age: ${answers.age ?? 'unknown'}\n` +
          `- Experience: ${answers.experienceLevel ?? 'unknown'}\n` +
          `- Goal: ${answers.trainingGoal ?? 'general fitness'}\n` +
          `- Equipment: ${answers.equipment ?? 'unknown'}\n` +
          `- Days per week they can train: ${answers.daysPerWeek ?? 3}\n` +
          `Return one repeating training week (the "days" array), progression rules for how it ` +
          `advances week to week, and ${durationWeeks > 4 ? 'phases whose weeks sum to ' + durationWeeks : 'an empty phases array'}.`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('The AI plan writer declined this request; falling back to the plan library.');
  }
  return JSON.parse(response.content.find((b) => b.type === 'text').text);
}
