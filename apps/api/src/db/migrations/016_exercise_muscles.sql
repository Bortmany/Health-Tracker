-- 016: muscle heatmap — tag every library exercise with the body regions it
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
