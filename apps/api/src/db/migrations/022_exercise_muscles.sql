-- 022: muscle heatmap — tag every library exercise with the body regions it
-- works, so the app can colour a body map from a user's training logs.
-- primary_muscles = the main movers (full credit), secondary_muscles = the
-- helpers (half credit). Both arrays may only contain the 16 canonical
-- region ids the frontend body map knows how to draw.

ALTER TABLE exercise_library
  ADD COLUMN primary_muscles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN secondary_muscles TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE exercise_library
  ADD CONSTRAINT exercise_library_muscles_valid CHECK (
    primary_muscles <@ ARRAY[
      'chest','front-delts','side-delts','rear-delts','biceps','triceps',
      'forearms','traps','lats','lower-back','abs','obliques','glutes',
      'quads','hamstrings','calves'
    ]::TEXT[]
    AND secondary_muscles <@ ARRAY[
      'chest','front-delts','side-delts','rear-delts','biceps','triceps',
      'forearms','traps','lats','lower-back','abs','obliques','glutes',
      'quads','hamstrings','calves'
    ]::TEXT[]
  );

-- Seed the mapping for all 50 library exercises (names are unique).

-- Squat family: quads and glutes lead, hamstrings assist; loaded barbell
-- variants also make the lower back and abs work to hold the trunk steady.
UPDATE exercise_library SET primary_muscles = '{quads,glutes}', secondary_muscles = '{hamstrings,lower-back,abs}' WHERE name = 'Barbell back squat';
UPDATE exercise_library SET primary_muscles = '{quads,glutes}', secondary_muscles = '{hamstrings,lower-back,abs}' WHERE name = 'Front squat';
UPDATE exercise_library SET primary_muscles = '{quads,glutes}', secondary_muscles = '{hamstrings}' WHERE name = 'Goblet squat';
UPDATE exercise_library SET primary_muscles = '{quads,glutes}', secondary_muscles = '{hamstrings}' WHERE name = 'Bodyweight squat';
UPDATE exercise_library SET primary_muscles = '{quads,glutes}', secondary_muscles = '{hamstrings}' WHERE name = 'Leg press machine';
UPDATE exercise_library SET primary_muscles = '{quads,glutes}', secondary_muscles = '{hamstrings}' WHERE name = 'Dumbbell lunge';
UPDATE exercise_library SET primary_muscles = '{quads,glutes}', secondary_muscles = '{hamstrings}' WHERE name = 'Step-up';

-- Hinge family: hamstrings and glutes lead, lower back stabilises; heavy
-- deadlifts also load the grip (forearms) and traps.
UPDATE exercise_library SET primary_muscles = '{hamstrings,glutes}', secondary_muscles = '{lower-back,forearms,traps}' WHERE name = 'Deadlift';
UPDATE exercise_library SET primary_muscles = '{hamstrings,glutes}', secondary_muscles = '{lower-back,forearms,traps}' WHERE name = 'Sumo deadlift';
UPDATE exercise_library SET primary_muscles = '{hamstrings,glutes}', secondary_muscles = '{lower-back}' WHERE name = 'Romanian deadlift';
UPDATE exercise_library SET primary_muscles = '{hamstrings,glutes}', secondary_muscles = '{lower-back}' WHERE name = 'Dumbbell Romanian deadlift';
UPDATE exercise_library SET primary_muscles = '{hamstrings}', secondary_muscles = '{calves}' WHERE name = 'Leg curl machine';

-- Hip thrust / glute bridge: glutes lead, hamstrings assist.
UPDATE exercise_library SET primary_muscles = '{glutes}', secondary_muscles = '{hamstrings}' WHERE name = 'Barbell hip thrust';
UPDATE exercise_library SET primary_muscles = '{glutes}', secondary_muscles = '{hamstrings}' WHERE name = 'Glute bridge';

-- Horizontal push: chest leads, front shoulders and triceps assist.
UPDATE exercise_library SET primary_muscles = '{chest}', secondary_muscles = '{front-delts,triceps}' WHERE name = 'Bench press';
UPDATE exercise_library SET primary_muscles = '{chest}', secondary_muscles = '{front-delts,triceps}' WHERE name = 'Incline bench press';
UPDATE exercise_library SET primary_muscles = '{chest}', secondary_muscles = '{front-delts,triceps}' WHERE name = 'Dumbbell bench press';
UPDATE exercise_library SET primary_muscles = '{chest}', secondary_muscles = '{front-delts,triceps}' WHERE name = 'Chest press machine';
UPDATE exercise_library SET primary_muscles = '{chest}', secondary_muscles = '{front-delts,triceps}' WHERE name = 'Push-up';
UPDATE exercise_library SET primary_muscles = '{chest}', secondary_muscles = '{front-delts,triceps}' WHERE name = 'Incline push-up';
UPDATE exercise_library SET primary_muscles = '{chest}', secondary_muscles = '{front-delts,triceps}' WHERE name = 'Dip';

-- Vertical push: front shoulders lead; side delts, triceps and traps assist.
UPDATE exercise_library SET primary_muscles = '{front-delts}', secondary_muscles = '{side-delts,triceps,traps}' WHERE name = 'Overhead press';
UPDATE exercise_library SET primary_muscles = '{front-delts}', secondary_muscles = '{side-delts,triceps,traps}' WHERE name = 'Dumbbell shoulder press';

-- Vertical pull: lats lead; biceps, forearms and rear delts assist
-- (chin-ups use the biceps hard enough to count as a main mover).
UPDATE exercise_library SET primary_muscles = '{lats}', secondary_muscles = '{biceps,forearms,rear-delts}' WHERE name = 'Pull-up';
UPDATE exercise_library SET primary_muscles = '{lats}', secondary_muscles = '{biceps,forearms,rear-delts}' WHERE name = 'Band-assisted pull-up';
UPDATE exercise_library SET primary_muscles = '{lats}', secondary_muscles = '{biceps,forearms,rear-delts}' WHERE name = 'Lat pulldown';
UPDATE exercise_library SET primary_muscles = '{lats,biceps}', secondary_muscles = '{forearms,rear-delts}' WHERE name = 'Chin-up';

-- Horizontal pull: lats and traps lead; biceps and rear delts assist; the
-- bent-over barbell row also makes the lower back hold the hinge position.
UPDATE exercise_library SET primary_muscles = '{lats,traps}', secondary_muscles = '{biceps,rear-delts,lower-back}' WHERE name = 'Barbell row';
UPDATE exercise_library SET primary_muscles = '{lats,traps}', secondary_muscles = '{biceps,rear-delts}' WHERE name = 'Dumbbell row';
UPDATE exercise_library SET primary_muscles = '{lats,traps}', secondary_muscles = '{biceps,rear-delts}' WHERE name = 'Seated cable row';

-- Isolations.
UPDATE exercise_library SET primary_muscles = '{biceps}', secondary_muscles = '{forearms}' WHERE name = 'Dumbbell bicep curl';
UPDATE exercise_library SET primary_muscles = '{side-delts}', secondary_muscles = '{}' WHERE name = 'Dumbbell lateral raise';
UPDATE exercise_library SET primary_muscles = '{calves}', secondary_muscles = '{}' WHERE name = 'Dumbbell calf raise';
UPDATE exercise_library SET primary_muscles = '{quads}', secondary_muscles = '{}' WHERE name = 'Leg extension machine';
UPDATE exercise_library SET primary_muscles = '{rear-delts}', secondary_muscles = '{traps}' WHERE name = 'Band face pull';
UPDATE exercise_library SET primary_muscles = '{rear-delts}', secondary_muscles = '{traps}' WHERE name = 'Band pull-apart';

-- Core.
UPDATE exercise_library SET primary_muscles = '{abs}', secondary_muscles = '{obliques}' WHERE name = 'Plank';
UPDATE exercise_library SET primary_muscles = '{abs}', secondary_muscles = '{obliques}' WHERE name = 'Mountain climber';
UPDATE exercise_library SET primary_muscles = '{abs}', secondary_muscles = '{obliques,lower-back}' WHERE name = 'Bird dog';
UPDATE exercise_library SET primary_muscles = '{obliques}', secondary_muscles = '{abs}' WHERE name = 'Side plank';

-- Cardio: whole-body conditioning, so no primary strength target; the legs
-- (or, for rowing, legs plus back) get light secondary credit.
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,calves,glutes}' WHERE name = 'Brisk walk';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,calves,glutes}' WHERE name = 'Easy run';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,calves,glutes}' WHERE name = 'Interval sprints';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,calves,glutes}' WHERE name = 'Hill sprints';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,calves,glutes}' WHERE name = 'Stationary bike';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,calves,glutes}' WHERE name = 'Cycling';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,calves,glutes}' WHERE name = 'Treadmill incline walk';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,calves,glutes}' WHERE name = 'Elliptical';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{quads,glutes,lats,lower-back}' WHERE name = 'Rowing machine';
UPDATE exercise_library SET primary_muscles = '{}', secondary_muscles = '{calves}' WHERE name = 'Jump rope';

-- The 14 seeded workout plans (migration 010) name 49 exercises that aren't in
-- the 50-movement library, so a member following their plan would log them
-- and see a dark map. They get their own muscle tags here, kept apart from
-- the library so the library's search and instructions stay unchanged.
CREATE TABLE exercise_muscle_tags (
  name TEXT PRIMARY KEY,
  primary_muscles TEXT[] NOT NULL DEFAULT '{}',
  secondary_muscles TEXT[] NOT NULL DEFAULT '{}',
  CONSTRAINT exercise_muscle_tags_muscles_valid CHECK (
    primary_muscles <@ ARRAY[
      'chest','front-delts','side-delts','rear-delts','biceps','triceps',
      'forearms','traps','lats','lower-back','abs','obliques','glutes',
      'quads','hamstrings','calves'
    ]::TEXT[]
    AND secondary_muscles <@ ARRAY[
      'chest','front-delts','side-delts','rear-delts','biceps','triceps',
      'forearms','traps','lats','lower-back','abs','obliques','glutes',
      'quads','hamstrings','calves'
    ]::TEXT[]
  )
);
CREATE UNIQUE INDEX exercise_muscle_tags_lower_name_idx ON exercise_muscle_tags (LOWER(name));

-- Same credit rules as the library above: main movers first, helpers second.
INSERT INTO exercise_muscle_tags (name, primary_muscles, secondary_muscles) VALUES
  -- Squats, lunges and leg machines
  ('Barbell front squat', '{quads,glutes}', '{hamstrings,lower-back,abs}'),
  ('Barbell pause squat', '{quads,glutes}', '{hamstrings,lower-back,abs}'),
  ('Goblet squat to box', '{quads,glutes}', '{hamstrings}'),
  ('Bulgarian split squat', '{quads,glutes}', '{hamstrings}'),
  ('Dumbbell reverse lunge', '{quads,glutes}', '{hamstrings}'),
  ('Reverse lunge', '{quads,glutes}', '{hamstrings}'),
  ('Sit-to-stand', '{quads,glutes}', '{}'),
  ('Leg press', '{quads,glutes}', '{hamstrings}'),
  ('Leg extension', '{quads}', '{}'),
  ('Leg curl', '{hamstrings}', '{calves}'),
  ('Standing calf raise', '{calves}', '{}'),
  ('Seated calf raise', '{calves}', '{}'),
  -- Hinges and glutes
  ('Barbell deadlift', '{hamstrings,glutes}', '{lower-back,forearms,traps}'),
  ('Back extension', '{lower-back}', '{glutes,hamstrings}'),
  ('Single-leg glute bridge', '{glutes}', '{hamstrings}'),
  -- Pushing
  ('Barbell bench press', '{chest}', '{front-delts,triceps}'),
  ('Incline dumbbell press', '{chest}', '{front-delts,triceps}'),
  ('Machine chest press', '{chest}', '{front-delts,triceps}'),
  ('Dumbbell floor press', '{chest}', '{front-delts,triceps}'),
  ('Wall push-up', '{chest}', '{front-delts,triceps}'),
  ('Diamond push-up', '{triceps,chest}', '{front-delts}'),
  ('Close grip bench press', '{triceps,chest}', '{front-delts}'),
  ('Barbell overhead press', '{front-delts}', '{side-delts,triceps,traps}'),
  ('Pike push-up', '{front-delts}', '{side-delts,triceps}'),
  -- Pulling
  ('Wide grip pull-up', '{lats}', '{biceps,forearms,rear-delts}'),
  ('Scapular pull-up', '{lats}', '{traps,forearms}'),
  ('Band row', '{lats,traps}', '{biceps,rear-delts}'),
  ('Doorway row', '{lats,traps}', '{biceps,rear-delts}'),
  ('Cable face pull', '{rear-delts}', '{traps}'),
  ('Dumbbell rear delt fly', '{rear-delts}', '{traps}'),
  -- Arms
  ('Dumbbell curl', '{biceps}', '{forearms}'),
  ('Band curl', '{biceps}', '{forearms}'),
  ('Hammer curl', '{biceps,forearms}', '{}'),
  ('Triceps pushdown', '{triceps}', '{}'),
  ('Overhead triceps extension', '{triceps}', '{}'),
  -- Core and carries
  ('Crunch', '{abs}', '{}'),
  ('Cable crunch', '{abs}', '{obliques}'),
  ('Dead bug', '{abs}', '{obliques}'),
  ('Hanging knee raise', '{abs}', '{obliques,forearms}'),
  ('Hanging leg raise', '{abs}', '{obliques,forearms}'),
  ('Plank shoulder tap', '{abs}', '{obliques,front-delts}'),
  ('Suitcase carry', '{obliques}', '{forearms,traps,abs}'),
  -- Runs and walks: light leg credit, like the library's cardio
  ('Warm-up jog', '{}', '{quads,calves,glutes}'),
  ('Cool-down jog', '{}', '{quads,calves,glutes}'),
  ('Cool-down walk', '{}', '{quads,calves,glutes}'),
  ('Easy run intervals', '{}', '{quads,calves,glutes}'),
  ('Hard run intervals', '{}', '{quads,calves,glutes}'),
  ('Tempo run', '{}', '{quads,calves,glutes}'),
  ('Long run', '{}', '{quads,calves,glutes}');
