import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings, useUpdateSettings } from '../hooks/useSettings.js';
import styles from './Onboarding.module.css';

const STEPS = [
  {
    key: 'age',
    title: 'How old are you?',
    subtitle: 'This helps us pick plans that suit your body, not fight it.',
    type: 'number',
  },
  {
    key: 'experienceLevel',
    title: 'How much training experience do you have?',
    subtitle: 'Be honest — the right starting point beats the impressive one.',
    options: [
      { value: 'beginner', label: 'Just starting out', hint: 'Less than a year of consistent training' },
      { value: 'intermediate', label: 'Some experience', hint: '1–3 years of fairly consistent training' },
      { value: 'advanced', label: 'Experienced', hint: 'Several years of structured training' },
    ],
  },
  {
    key: 'trainingGoal',
    title: 'What kind of training do you want to do?',
    subtitle: 'You can always change this later.',
    options: [
      { value: 'calisthenics', label: 'Bodyweight / calisthenics', hint: 'Push-ups, pull-ups, using your own body' },
      { value: 'powerlifting', label: 'Get strong with a barbell', hint: 'Squat, bench, deadlift' },
      { value: 'hypertrophy', label: 'Build muscle', hint: 'Classic gym training for size' },
      { value: 'cardio', label: 'Cardio & endurance', hint: 'Running, walking, getting fitter' },
      { value: 'general', label: 'General fitness', hint: 'A bit of everything, feel better' },
    ],
  },
  {
    key: 'equipment',
    title: 'What equipment do you have access to?',
    options: [
      { value: 'none', label: 'Nothing / just my body' },
      { value: 'minimal', label: 'Some basics', hint: 'Dumbbells, bands, maybe a pull-up bar' },
      { value: 'full_gym', label: 'A full gym' },
    ],
  },
  {
    key: 'daysPerWeek',
    title: 'How many days a week can you realistically train?',
    subtitle: 'Pick what you can keep up for months, not your best week ever.',
    options: [
      { value: 2, label: '2 days' },
      { value: 3, label: '3 days' },
      { value: 4, label: '4 days' },
      { value: 5, label: '5+ days' },
    ],
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const step = STEPS[stepIndex];

  // Wait for existing settings to load so finishing the quiz can't
  // accidentally overwrite saved goals with blanks.
  if (isLoading) {
    return (
      <div className={styles.screen}>
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  function saveAndFinish(finalAnswers) {
    updateSettings.mutate(
      {
        // Keep whatever the person already had in settings.
        startWeight: settings?.startWeight ?? null,
        targetWeight: settings?.targetWeight ?? null,
        targetDate: settings?.targetDate ?? null,
        height: settings?.height ?? null,
        stepGoal: settings?.stepGoal ?? null,
        sleepGoal: settings?.sleepGoal ?? null,
        age: finalAnswers.age ?? settings?.age ?? null,
        experienceLevel: finalAnswers.experienceLevel,
        trainingGoal: finalAnswers.trainingGoal,
        equipment: finalAnswers.equipment,
        daysPerWeek: finalAnswers.daysPerWeek,
      },
      { onSuccess: () => navigate('/train') }
    );
  }

  function answer(value) {
    const next = { ...answers, [step.key]: value };
    setAnswers(next);
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else saveAndFinish(next);
  }

  return (
    <div className={styles.screen}>
      <p className={styles.progress}>
        {stepIndex + 1} of {STEPS.length}
      </p>
      <h1 className={styles.title}>{step.title}</h1>
      {step.subtitle && <p className={styles.subtitle}>{step.subtitle}</p>}

      {step.type === 'number' ? (
        <form
          className={styles.numberForm}
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(new FormData(e.target).get('value'));
            if (value > 0) answer(value);
          }}
        >
          <input className={styles.numberInput} name="value" type="number" inputMode="numeric" min="13" max="100" autoFocus />
          <button className={styles.nextButton} type="submit">
            Next
          </button>
        </form>
      ) : (
        <div className={styles.options}>
          {step.options.map((opt) => (
            <button key={String(opt.value)} type="button" className={styles.option} onClick={() => answer(opt.value)}>
              <span className={styles.optionLabel}>{opt.label}</span>
              {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
            </button>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        {stepIndex > 0 && (
          <button type="button" className={styles.backButton} onClick={() => setStepIndex(stepIndex - 1)}>
            Back
          </button>
        )}
        <button type="button" className={styles.skipButton} onClick={() => navigate('/')}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
