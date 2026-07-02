-- Seed data for the curated plan library.
-- Inserts: 14 rows into plan_templates, 49 rows into plan_template_days,
-- 213 rows into plan_template_exercises.
-- No hardcoded UUIDs; days and exercises are inserted via name lookups.

-- ---------------------------------------------------------------------------
-- 1. Bodyweight foundations (beginner calisthenics, no equipment, 3 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Bodyweight foundations',
  '3 days a week, no equipment at all, builds your first full push-up and basic pulling strength using your doorway and the floor.',
  'calisthenics', 'beginner', 'none', 3,
  '{"type":"reps","repStep":1}'::jsonb,
  '[{"name":"Getting started","weeks":8,"focus":"learning the movements and showing up three times a week"},{"name":"Building reps","weeks":16,"focus":"adding a rep or two each week on push-ups and rows"},{"name":"Harder variations","weeks":16,"focus":"lowering the incline on push-ups and slowing rows down"},{"name":"Full push-up","weeks":12,"focus":"clean full push-ups from the floor and steady sets of rows"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Full body A', 0 FROM plan_templates WHERE name = 'Bodyweight foundations';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Full body B', 1 FROM plan_templates WHERE name = 'Bodyweight foundations';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Full body C', 2 FROM plan_templates WHERE name = 'Bodyweight foundations';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Incline push-up', 3, 8, 0),
  ('Doorway row', 3, 8, 1),
  ('Bodyweight squat', 3, 12, 2),
  ('Glute bridge', 3, 12, 3),
  ('Plank shoulder tap', 2, 10, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Bodyweight foundations' AND d.name = 'Day 1 — Full body A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Wall push-up', 3, 12, 0),
  ('Doorway row', 3, 10, 1),
  ('Reverse lunge', 2, 8, 2),
  ('Bird dog', 2, 10, 3),
  ('Dead bug', 2, 10, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Bodyweight foundations' AND d.name = 'Day 2 — Full body B';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Incline push-up', 3, 8, 0),
  ('Doorway row', 3, 8, 1),
  ('Bodyweight squat', 3, 15, 2),
  ('Step-up', 2, 10, 3),
  ('Crunch', 2, 15, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Bodyweight foundations' AND d.name = 'Day 3 — Full body C';

-- ---------------------------------------------------------------------------
-- 2. First pull-up program (beginner calisthenics, minimal, 3 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'First pull-up program',
  '3 days a week with just a pull-up bar and resistance bands, working steadily toward your first unassisted pull-up.',
  'calisthenics', 'beginner', 'minimal', 3,
  '{"type":"reps","repStep":1}'::jsonb,
  '[{"name":"Hang and hold","weeks":8,"focus":"getting comfortable hanging from the bar and using bands"},{"name":"Assisted reps","weeks":16,"focus":"adding band-assisted pull-up reps week by week"},{"name":"Lighter bands","weeks":16,"focus":"moving to thinner bands as you get stronger"},{"name":"First pull-up","weeks":12,"focus":"testing unassisted reps and building to sets of three"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Full body A', 0 FROM plan_templates WHERE name = 'First pull-up program';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Full body B', 1 FROM plan_templates WHERE name = 'First pull-up program';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Full body C', 2 FROM plan_templates WHERE name = 'First pull-up program';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Band-assisted pull-up', 3, 5, 0),
  ('Push-up', 3, 6, 1),
  ('Bodyweight squat', 3, 12, 2),
  ('Scapular pull-up', 2, 5, 3),
  ('Band pull-apart', 2, 15, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'First pull-up program' AND d.name = 'Day 1 — Full body A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Incline push-up', 3, 10, 0),
  ('Band row', 3, 12, 1),
  ('Reverse lunge', 3, 8, 2),
  ('Hanging knee raise', 2, 8, 3),
  ('Band pull-apart', 2, 15, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'First pull-up program' AND d.name = 'Day 2 — Full body B';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Band-assisted pull-up', 3, 5, 0),
  ('Push-up', 3, 8, 1),
  ('Glute bridge', 3, 12, 2),
  ('Scapular pull-up', 2, 5, 3),
  ('Plank shoulder tap', 2, 10, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'First pull-up program' AND d.name = 'Day 3 — Full body C';

-- ---------------------------------------------------------------------------
-- 3. Calisthenics strength builder (intermediate calisthenics, minimal, 4 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Calisthenics strength builder',
  '4 days a week with a pull-up bar and bands, adding reps on pull-ups, harder push-up variations, and single-leg work.',
  'calisthenics', 'intermediate', 'minimal', 4,
  '{"type":"reps","repStep":1,"deloadEveryWeeks":4}'::jsonb,
  '[{"name":"Volume base","weeks":10,"focus":"building solid sets of pull-ups, push-ups, and split squats"},{"name":"Harder variations","weeks":14,"focus":"wide grip pull-ups, pike push-ups, and slower tempos"},{"name":"Density","weeks":14,"focus":"more reps in the same time with shorter rests"},{"name":"Peak and test","weeks":14,"focus":"max rep tests on pull-ups and push-ups, then rebuild"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Pull', 0 FROM plan_templates WHERE name = 'Calisthenics strength builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Push', 1 FROM plan_templates WHERE name = 'Calisthenics strength builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Legs and core', 2 FROM plan_templates WHERE name = 'Calisthenics strength builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 4 — Pull and arms', 3 FROM plan_templates WHERE name = 'Calisthenics strength builder';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Pull-up', 4, 6, 0),
  ('Band row', 3, 12, 1),
  ('Hanging leg raise', 3, 8, 2),
  ('Band face pull', 3, 12, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Calisthenics strength builder' AND d.name = 'Day 1 — Pull';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Push-up', 4, 12, 0),
  ('Pike push-up', 3, 8, 1),
  ('Diamond push-up', 3, 8, 2),
  ('Plank shoulder tap', 3, 12, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Calisthenics strength builder' AND d.name = 'Day 2 — Push';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Bulgarian split squat', 3, 8, 0),
  ('Bodyweight squat', 3, 20, 1),
  ('Single-leg glute bridge', 3, 10, 2),
  ('Hanging knee raise', 3, 10, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Calisthenics strength builder' AND d.name = 'Day 3 — Legs and core';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Chin-up', 4, 5, 0),
  ('Wide grip pull-up', 3, 5, 1),
  ('Band curl', 3, 12, 2),
  ('Band pull-apart', 3, 15, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Calisthenics strength builder' AND d.name = 'Day 4 — Pull and arms';

-- ---------------------------------------------------------------------------
-- 4. Barbell basics 3x5 (beginner powerlifting, full gym, 3 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Barbell basics 3x5',
  '3 days a week in the gym learning the squat, bench press, deadlift, and overhead press, adding a little weight every session.',
  'powerlifting', 'beginner', 'full_gym', 3,
  '{"type":"weight","weightPct":2.5}'::jsonb,
  '[{"name":"Learn the lifts","weeks":8,"focus":"light weights and getting the technique right"},{"name":"Steady gains","weeks":20,"focus":"adding a small amount of weight every session"},{"name":"Grind through sticking points","weeks":14,"focus":"slower progress, repeat weights when needed"},{"name":"Consolidate","weeks":10,"focus":"locking in your new strength with confident, clean sets"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Squat and bench', 0 FROM plan_templates WHERE name = 'Barbell basics 3x5';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Deadlift and press', 1 FROM plan_templates WHERE name = 'Barbell basics 3x5';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Full body', 2 FROM plan_templates WHERE name = 'Barbell basics 3x5';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell back squat', 3, 5, 0),
  ('Barbell bench press', 3, 5, 1),
  ('Barbell row', 3, 8, 2)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Barbell basics 3x5' AND d.name = 'Day 1 — Squat and bench';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell deadlift', 2, 5, 0),
  ('Barbell overhead press', 3, 5, 1),
  ('Lat pulldown', 3, 10, 2)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Barbell basics 3x5' AND d.name = 'Day 2 — Deadlift and press';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell back squat', 3, 5, 0),
  ('Barbell bench press', 3, 5, 1),
  ('Barbell row', 3, 8, 2)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Barbell basics 3x5' AND d.name = 'Day 3 — Full body';

-- ---------------------------------------------------------------------------
-- 5. Four-day strength split (intermediate powerlifting, full gym, 4 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Four-day strength split',
  '4 days a week with a dedicated day each for squat, bench press, deadlift, and overhead press, plus supporting assistance work.',
  'powerlifting', 'intermediate', 'full_gym', 4,
  '{"type":"weight","weightPct":2.5,"deloadEveryWeeks":4}'::jsonb,
  '[{"name":"Volume block","weeks":12,"focus":"more sets at moderate weights to build work capacity"},{"name":"Strength block","weeks":14,"focus":"heavier sets of five and three on the main lifts"},{"name":"Intensity block","weeks":12,"focus":"heavy triples and doubles with full recovery between sets"},{"name":"Test and reset","weeks":14,"focus":"work up to new personal bests, then start a fresh cycle lighter"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Squat', 0 FROM plan_templates WHERE name = 'Four-day strength split';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Bench press', 1 FROM plan_templates WHERE name = 'Four-day strength split';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Deadlift', 2 FROM plan_templates WHERE name = 'Four-day strength split';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 4 — Overhead press', 3 FROM plan_templates WHERE name = 'Four-day strength split';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell back squat', 4, 5, 0),
  ('Leg press', 3, 10, 1),
  ('Leg curl', 3, 10, 2),
  ('Standing calf raise', 3, 12, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Four-day strength split' AND d.name = 'Day 1 — Squat';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell bench press', 4, 5, 0),
  ('Incline dumbbell press', 3, 10, 1),
  ('Dumbbell row', 3, 10, 2),
  ('Triceps pushdown', 3, 12, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Four-day strength split' AND d.name = 'Day 2 — Bench press';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell deadlift', 4, 3, 0),
  ('Romanian deadlift', 3, 8, 1),
  ('Lat pulldown', 3, 10, 2),
  ('Back extension', 3, 12, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Four-day strength split' AND d.name = 'Day 3 — Deadlift';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell overhead press', 4, 5, 0),
  ('Close grip bench press', 3, 8, 1),
  ('Chin-up', 3, 8, 2),
  ('Cable face pull', 3, 15, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Four-day strength split' AND d.name = 'Day 4 — Overhead press';

-- ---------------------------------------------------------------------------
-- 6. Full-body muscle starter (beginner hypertrophy, full gym, 3 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Full-body muscle starter',
  '3 full-body gym sessions a week using simple barbell, dumbbell, and machine exercises to build muscle all over.',
  'hypertrophy', 'beginner', 'full_gym', 3,
  '{"type":"weight","weightPct":2.5}'::jsonb,
  '[{"name":"Learn the machines","weeks":8,"focus":"finding your working weights and grooving technique"},{"name":"Add weight","weeks":18,"focus":"small weight increases whenever you hit the top of the rep range"},{"name":"Add a set","weeks":14,"focus":"a little more volume on the muscles you want to grow"},{"name":"Keep it rolling","weeks":12,"focus":"steady progress and consistent effort close to failure"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Full body A', 0 FROM plan_templates WHERE name = 'Full-body muscle starter';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Full body B', 1 FROM plan_templates WHERE name = 'Full-body muscle starter';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Full body C', 2 FROM plan_templates WHERE name = 'Full-body muscle starter';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell back squat', 3, 8, 0),
  ('Barbell bench press', 3, 8, 1),
  ('Lat pulldown', 3, 10, 2),
  ('Dumbbell shoulder press', 2, 10, 3),
  ('Cable crunch', 2, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Full-body muscle starter' AND d.name = 'Day 1 — Full body A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Leg press', 3, 10, 0),
  ('Seated cable row', 3, 10, 1),
  ('Incline dumbbell press', 3, 10, 2),
  ('Dumbbell lateral raise', 2, 12, 3),
  ('Dumbbell curl', 2, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Full-body muscle starter' AND d.name = 'Day 2 — Full body B';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Romanian deadlift', 3, 8, 0),
  ('Machine chest press', 3, 10, 1),
  ('Lat pulldown', 3, 10, 2),
  ('Leg curl', 2, 12, 3),
  ('Triceps pushdown', 2, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Full-body muscle starter' AND d.name = 'Day 3 — Full body C';

-- ---------------------------------------------------------------------------
-- 7. Upper/lower muscle builder (intermediate hypertrophy, full gym, 4 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Upper/lower muscle builder',
  '4 days a week split into two upper-body and two lower-body sessions, with enough volume to grow and a deload every month.',
  'hypertrophy', 'intermediate', 'full_gym', 4,
  '{"type":"weight","weightPct":2.5,"deloadEveryWeeks":4}'::jsonb,
  '[{"name":"Base volume","weeks":12,"focus":"moderate weights, perfect form, full range of motion"},{"name":"Progressive overload","weeks":16,"focus":"adding weight or reps every week on the main lifts"},{"name":"Specialization","weeks":12,"focus":"extra sets for your weakest muscle groups"},{"name":"Consolidate","weeks":12,"focus":"hold your new working weights and let the muscle catch up"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Upper A', 0 FROM plan_templates WHERE name = 'Upper/lower muscle builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Lower A', 1 FROM plan_templates WHERE name = 'Upper/lower muscle builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Upper B', 2 FROM plan_templates WHERE name = 'Upper/lower muscle builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 4 — Lower B', 3 FROM plan_templates WHERE name = 'Upper/lower muscle builder';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell bench press', 4, 8, 0),
  ('Barbell row', 4, 8, 1),
  ('Dumbbell shoulder press', 3, 10, 2),
  ('Lat pulldown', 3, 10, 3),
  ('Dumbbell curl', 3, 12, 4),
  ('Triceps pushdown', 3, 12, 5)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Upper/lower muscle builder' AND d.name = 'Day 1 — Upper A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell back squat', 4, 8, 0),
  ('Romanian deadlift', 3, 10, 1),
  ('Leg press', 3, 12, 2),
  ('Leg curl', 3, 12, 3),
  ('Standing calf raise', 4, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Upper/lower muscle builder' AND d.name = 'Day 2 — Lower A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell overhead press', 4, 8, 0),
  ('Chin-up', 3, 8, 1),
  ('Incline dumbbell press', 3, 10, 2),
  ('Seated cable row', 3, 10, 3),
  ('Dumbbell lateral raise', 3, 15, 4),
  ('Cable face pull', 3, 15, 5)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Upper/lower muscle builder' AND d.name = 'Day 3 — Upper B';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell deadlift', 3, 5, 0),
  ('Bulgarian split squat', 3, 10, 1),
  ('Leg extension', 3, 12, 2),
  ('Seated calf raise', 3, 15, 3),
  ('Cable crunch', 3, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Upper/lower muscle builder' AND d.name = 'Day 4 — Lower B';

-- ---------------------------------------------------------------------------
-- 8. Push/pull/legs six-day (intermediate hypertrophy, full gym, 6 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Push/pull/legs six-day',
  '6 days a week hitting each muscle twice with a classic push, pull, legs rotation — for people who love being in the gym.',
  'hypertrophy', 'intermediate', 'full_gym', 6,
  '{"type":"weight","weightPct":2.5,"deloadEveryWeeks":4}'::jsonb,
  '[{"name":"Base volume","weeks":10,"focus":"settling into the six-day rhythm without burning out"},{"name":"Progressive overload","weeks":16,"focus":"adding weight or a rep on every exercise each week"},{"name":"Push the volume","weeks":12,"focus":"an extra set on lagging muscle groups"},{"name":"Peak and deload","weeks":14,"focus":"heaviest working weights of the year, then a proper easy week"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Push A', 0 FROM plan_templates WHERE name = 'Push/pull/legs six-day';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Pull A', 1 FROM plan_templates WHERE name = 'Push/pull/legs six-day';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Legs A', 2 FROM plan_templates WHERE name = 'Push/pull/legs six-day';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 4 — Push B', 3 FROM plan_templates WHERE name = 'Push/pull/legs six-day';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 5 — Pull B', 4 FROM plan_templates WHERE name = 'Push/pull/legs six-day';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 6 — Legs B', 5 FROM plan_templates WHERE name = 'Push/pull/legs six-day';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell bench press', 4, 8, 0),
  ('Barbell overhead press', 3, 10, 1),
  ('Incline dumbbell press', 3, 10, 2),
  ('Dumbbell lateral raise', 3, 15, 3),
  ('Triceps pushdown', 3, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Push/pull/legs six-day' AND d.name = 'Day 1 — Push A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell row', 4, 8, 0),
  ('Lat pulldown', 3, 10, 1),
  ('Seated cable row', 3, 10, 2),
  ('Cable face pull', 3, 15, 3),
  ('Dumbbell curl', 3, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Push/pull/legs six-day' AND d.name = 'Day 2 — Pull A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell back squat', 4, 8, 0),
  ('Romanian deadlift', 3, 10, 1),
  ('Leg press', 3, 12, 2),
  ('Leg curl', 3, 12, 3),
  ('Standing calf raise', 4, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Push/pull/legs six-day' AND d.name = 'Day 3 — Legs A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell overhead press', 4, 8, 0),
  ('Incline bench press', 3, 10, 1),
  ('Machine chest press', 3, 12, 2),
  ('Dumbbell lateral raise', 3, 15, 3),
  ('Overhead triceps extension', 3, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Push/pull/legs six-day' AND d.name = 'Day 4 — Push B';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell deadlift', 3, 5, 0),
  ('Chin-up', 3, 8, 1),
  ('Dumbbell row', 3, 10, 2),
  ('Dumbbell rear delt fly', 3, 15, 3),
  ('Hammer curl', 3, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Push/pull/legs six-day' AND d.name = 'Day 5 — Pull B';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell front squat', 3, 8, 0),
  ('Bulgarian split squat', 3, 10, 1),
  ('Leg extension', 3, 12, 2),
  ('Leg curl', 3, 12, 3),
  ('Seated calf raise', 3, 15, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Push/pull/legs six-day' AND d.name = 'Day 6 — Legs B';

-- ---------------------------------------------------------------------------
-- 9. Dumbbell muscle at home (beginner hypertrophy, minimal, 3 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Dumbbell muscle at home',
  '3 full-body sessions a week with just a pair of dumbbells — everything you need to build muscle at home.',
  'hypertrophy', 'beginner', 'minimal', 3,
  '{"type":"weight","weightPct":2.5}'::jsonb,
  '[{"name":"Groove the movements","weeks":8,"focus":"light dumbbells and controlled, full range reps"},{"name":"Add reps, then weight","weeks":18,"focus":"work up the rep range before moving to heavier dumbbells"},{"name":"Slow it down","weeks":14,"focus":"slower lowering phases to keep light weights challenging"},{"name":"Keep progressing","weeks":12,"focus":"steady weekly progress on every exercise"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Full body A', 0 FROM plan_templates WHERE name = 'Dumbbell muscle at home';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Full body B', 1 FROM plan_templates WHERE name = 'Dumbbell muscle at home';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Full body C', 2 FROM plan_templates WHERE name = 'Dumbbell muscle at home';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Goblet squat', 3, 10, 0),
  ('Dumbbell floor press', 3, 10, 1),
  ('Dumbbell row', 3, 10, 2),
  ('Dumbbell shoulder press', 2, 10, 3),
  ('Dumbbell curl', 2, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Dumbbell muscle at home' AND d.name = 'Day 1 — Full body A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Dumbbell Romanian deadlift', 3, 10, 0),
  ('Dumbbell floor press', 3, 10, 1),
  ('Dumbbell row', 3, 10, 2),
  ('Dumbbell lateral raise', 2, 12, 3),
  ('Overhead triceps extension', 2, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Dumbbell muscle at home' AND d.name = 'Day 2 — Full body B';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Dumbbell reverse lunge', 3, 8, 0),
  ('Goblet squat', 3, 12, 1),
  ('Dumbbell row', 3, 10, 2),
  ('Dumbbell shoulder press', 2, 10, 3),
  ('Hammer curl', 2, 12, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Dumbbell muscle at home' AND d.name = 'Day 3 — Full body C';

-- ---------------------------------------------------------------------------
-- 10. Walk to run (beginner cardio, no equipment, 3 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Walk to run',
  '3 easy sessions a week that take you from brisk walking to running for 30 minutes straight — couch to 5k, at your pace.',
  'cardio', 'beginner', 'none', 3,
  '{"type":"time","minutesStep":2}'::jsonb,
  '[{"name":"Walking base","weeks":6,"focus":"brisk walks to get your legs and joints used to regular exercise"},{"name":"Walk-run intervals","weeks":14,"focus":"short jogging intervals mixed into your walks, growing each week"},{"name":"More running than walking","weeks":16,"focus":"longer run segments with short walking breaks"},{"name":"Run it all","weeks":16,"focus":"running 30 minutes without stopping, then keeping the habit"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Walk and jog', 0 FROM plan_templates WHERE name = 'Walk to run';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Walk and jog', 1 FROM plan_templates WHERE name = 'Walk to run';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Longer session', 2 FROM plan_templates WHERE name = 'Walk to run';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Brisk walk', 1, 10, 0),
  ('Easy run intervals', 1, 10, 1),
  ('Cool-down walk', 1, 5, 2)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Walk to run' AND d.name = 'Day 1 — Walk and jog';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Brisk walk', 1, 10, 0),
  ('Easy run intervals', 1, 12, 1),
  ('Cool-down walk', 1, 5, 2)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Walk to run' AND d.name = 'Day 2 — Walk and jog';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Brisk walk', 1, 15, 0),
  ('Easy run intervals', 1, 15, 1),
  ('Cool-down walk', 1, 5, 2)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Walk to run' AND d.name = 'Day 3 — Longer session';

-- ---------------------------------------------------------------------------
-- 11. Faster 5k builder (intermediate cardio, no equipment, 4 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Faster 5k builder',
  '4 runs a week mixing easy miles, intervals, a tempo run, and a long run to make you a faster, more durable runner.',
  'cardio', 'intermediate', 'none', 4,
  '{"type":"time","minutesStep":2}'::jsonb,
  '[{"name":"Aerobic base","weeks":12,"focus":"mostly easy running to build your engine"},{"name":"Speed work","weeks":14,"focus":"weekly intervals to raise your top-end pace"},{"name":"Tempo strength","weeks":12,"focus":"comfortably hard tempo runs to hold pace longer"},{"name":"Race and recover","weeks":14,"focus":"time-trial your 5k, then an easy stretch before rebuilding"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Easy run', 0 FROM plan_templates WHERE name = 'Faster 5k builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Intervals', 1 FROM plan_templates WHERE name = 'Faster 5k builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Tempo run', 2 FROM plan_templates WHERE name = 'Faster 5k builder';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 4 — Long run', 3 FROM plan_templates WHERE name = 'Faster 5k builder';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Easy run', 1, 30, 0),
  ('Cool-down walk', 1, 5, 1)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Faster 5k builder' AND d.name = 'Day 1 — Easy run';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Warm-up jog', 1, 10, 0),
  ('Hard run intervals', 1, 15, 1),
  ('Cool-down jog', 1, 5, 2)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Faster 5k builder' AND d.name = 'Day 2 — Intervals';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Warm-up jog', 1, 10, 0),
  ('Tempo run', 1, 20, 1),
  ('Cool-down jog', 1, 5, 2)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Faster 5k builder' AND d.name = 'Day 3 — Tempo run';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Long run', 1, 45, 0),
  ('Cool-down walk', 1, 5, 1)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Faster 5k builder' AND d.name = 'Day 4 — Long run';

-- ---------------------------------------------------------------------------
-- 12. Two-day busy person plan (beginner general, minimal, 2 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Two-day busy person plan',
  'Just 2 short sessions a week with a pair of dumbbells — the minimum effective dose of strength and movement for a packed schedule.',
  'general', 'beginner', 'minimal', 2,
  '{"type":"reps","repStep":1}'::jsonb,
  '[{"name":"Make it a habit","weeks":10,"focus":"never missing a session, however light it feels"},{"name":"Small weekly wins","weeks":16,"focus":"a rep more here, a slightly heavier dumbbell there"},{"name":"Solid all-rounder","weeks":14,"focus":"confident with every movement, walks feel easy"},{"name":"Maintain and enjoy","weeks":12,"focus":"keeping strength and energy with minimal time cost"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Full body strength', 0 FROM plan_templates WHERE name = 'Two-day busy person plan';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Strength and conditioning', 1 FROM plan_templates WHERE name = 'Two-day busy person plan';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Goblet squat', 3, 10, 0),
  ('Push-up', 3, 8, 1),
  ('Dumbbell row', 3, 10, 2),
  ('Dumbbell shoulder press', 2, 10, 3),
  ('Dead bug', 2, 10, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Two-day busy person plan' AND d.name = 'Day 1 — Full body strength';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Dumbbell Romanian deadlift', 3, 10, 0),
  ('Incline push-up', 3, 10, 1),
  ('Dumbbell reverse lunge', 2, 8, 2),
  ('Dumbbell row', 2, 12, 3),
  ('Brisk walk', 1, 15, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Two-day busy person plan' AND d.name = 'Day 2 — Strength and conditioning';

-- ---------------------------------------------------------------------------
-- 13. Strong after fifty (beginner general, minimal, 3 days, min_age 50)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, min_age, progression, phases)
VALUES (
  'Strong after fifty',
  '3 gentle, joint-friendly sessions a week with light dumbbells and bands, building the strength and balance that keep you independent.',
  'general', 'beginner', 'minimal', 3, 50,
  '{"type":"reps","repStep":1}'::jsonb,
  '[{"name":"Move well first","weeks":10,"focus":"pain-free range of motion and steady balance"},{"name":"Gentle strength","weeks":16,"focus":"a rep or two more each week, never straining"},{"name":"Carry and climb","weeks":14,"focus":"carries and step-ups for everyday strength"},{"name":"Keep it for life","weeks":12,"focus":"maintaining strength, balance, and the walking habit"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Strength A', 0 FROM plan_templates WHERE name = 'Strong after fifty';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Balance and mobility', 1 FROM plan_templates WHERE name = 'Strong after fifty';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Strength B', 2 FROM plan_templates WHERE name = 'Strong after fifty';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Goblet squat to box', 2, 10, 0),
  ('Incline push-up', 2, 10, 1),
  ('Band row', 2, 12, 2),
  ('Suitcase carry', 2, 20, 3),
  ('Brisk walk', 1, 10, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Strong after fifty' AND d.name = 'Day 1 — Strength A';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Sit-to-stand', 2, 10, 0),
  ('Wall push-up', 2, 12, 1),
  ('Band pull-apart', 2, 15, 2),
  ('Step-up', 2, 8, 3),
  ('Bird dog', 2, 10, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Strong after fifty' AND d.name = 'Day 2 — Balance and mobility';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Dumbbell Romanian deadlift', 2, 10, 0),
  ('Band row', 2, 12, 1),
  ('Incline push-up', 2, 10, 2),
  ('Standing calf raise', 2, 12, 3),
  ('Dead bug', 2, 10, 4)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Strong after fifty' AND d.name = 'Day 3 — Strength B';

-- ---------------------------------------------------------------------------
-- 14. Advanced powerlifting peaking (advanced powerlifting, full gym, 4 days)
-- ---------------------------------------------------------------------------
INSERT INTO plan_templates (name, description, goal, experience, equipment, days_per_week, progression, phases)
VALUES (
  'Advanced powerlifting peaking',
  '4 heavy days a week built around low-rep squat, bench, and deadlift work with targeted assistance and a monthly deload — for lifters chasing a total.',
  'powerlifting', 'advanced', 'full_gym', 4,
  '{"type":"weight","weightPct":2.5,"deloadEveryWeeks":4}'::jsonb,
  '[{"name":"Hypertrophy base","weeks":10,"focus":"higher-rep work to add muscle where your lifts need it"},{"name":"Strength block","weeks":14,"focus":"heavy fives and threes with tight technique"},{"name":"Intensity block","weeks":10,"focus":"doubles and singles above ninety percent"},{"name":"Peak and taper","weeks":6,"focus":"dial back volume and peak for max attempts"},{"name":"Recover and rebuild","weeks":12,"focus":"lighter training to recover before the next cycle"}]'::jsonb
);

INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 1 — Heavy squat', 0 FROM plan_templates WHERE name = 'Advanced powerlifting peaking';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 2 — Heavy bench', 1 FROM plan_templates WHERE name = 'Advanced powerlifting peaking';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 3 — Heavy deadlift', 2 FROM plan_templates WHERE name = 'Advanced powerlifting peaking';
INSERT INTO plan_template_days (plan_template_id, name, sort_order)
SELECT id, 'Day 4 — Volume press', 3 FROM plan_templates WHERE name = 'Advanced powerlifting peaking';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell back squat', 5, 3, 0),
  ('Barbell pause squat', 3, 5, 1),
  ('Leg press', 3, 10, 2),
  ('Leg curl', 3, 10, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Advanced powerlifting peaking' AND d.name = 'Day 1 — Heavy squat';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell bench press', 5, 3, 0),
  ('Close grip bench press', 3, 6, 1),
  ('Barbell row', 4, 8, 2),
  ('Cable face pull', 3, 15, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Advanced powerlifting peaking' AND d.name = 'Day 2 — Heavy bench';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell deadlift', 5, 2, 0),
  ('Romanian deadlift', 3, 8, 1),
  ('Lat pulldown', 3, 10, 2),
  ('Back extension', 3, 12, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Advanced powerlifting peaking' AND d.name = 'Day 3 — Heavy deadlift';

INSERT INTO plan_template_exercises (plan_template_day_id, name, target_sets, target_reps, sort_order)
SELECT d.id, e.name, e.sets, e.reps, e.ord
FROM plan_template_days d
JOIN plan_templates t ON t.id = d.plan_template_id
JOIN (VALUES
  ('Barbell overhead press', 4, 6, 0),
  ('Incline bench press', 3, 8, 1),
  ('Chin-up', 4, 8, 2),
  ('Dumbbell lateral raise', 3, 15, 3)
) AS e(name, sets, reps, ord) ON TRUE
WHERE t.name = 'Advanced powerlifting peaking' AND d.name = 'Day 4 — Volume press';
