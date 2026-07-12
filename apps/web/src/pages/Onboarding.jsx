import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Chip, EmptyState, ErrorText, Field, Input, Skeleton } from '../components/ui/index.js';
import { useAdoptTemplate, useRecommendedTemplates } from '../hooks/usePlans.js';
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

// The payoff after the quiz: show the top-matched plan, offer to start it,
// and optionally log a starting weight — all with existing mutations.
function RevealStep() {
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const { data: recommended = [], isLoading } = useRecommendedTemplates();
  const adopt = useAdoptTemplate();
  const updateSettings = useUpdateSettings();
  const [weight, setWeight] = useState('');
  const top = recommended[0];

  function saveWeightThenGoHome() {
    if (weight === '') {
      navigate('/');
      return;
    }
    updateSettings.mutate(
      {
        // Keep every other goal the person already had — only add the weight.
        startWeight: Number(weight),
        targetWeight: settings?.targetWeight ?? null,
        targetDate: settings?.targetDate ?? null,
        height: settings?.height ?? null,
        age: settings?.age ?? null,
        stepGoal: settings?.stepGoal ?? null,
        sleepGoal: settings?.sleepGoal ?? null,
      },
      { onSettled: () => navigate('/') }
    );
  }

  function handleStart() {
    if (!top) return;
    adopt.mutate(
      { id: top.id, startDate: new Date().toLocaleDateString('en-CA') },
      { onSuccess: saveWeightThenGoHome }
    );
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.revealTitle}>Here's your plan</h1>
      <p className={styles.subtitle}>Based on what you told us, this is where we'd start.</p>

      {isLoading ? (
        <Skeleton height={140} />
      ) : !top ? (
        <EmptyState
          action={<Button onClick={() => navigate('/train')}>Browse all plans</Button>}
        >
          We couldn't find a perfect match yet — that's alright. Browse all plans and pick one that feels right.
        </EmptyState>
      ) : (
        <>
          <Card className={styles.revealCard}>
            <div className={styles.planName}>{top.name}</div>
            <p className={styles.planDescription}>{top.description}</p>
            <div className={styles.tagRow}>
              <Chip>{top.goal}</Chip>
              <Chip>{top.experience}</Chip>
              <Chip>{top.daysPerWeek} days/week</Chip>
            </div>
          </Card>

          <div className={styles.weightField}>
            <Field label="Starting weight (kg)">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
            <p className={styles.reassurance}>
              Want to log your starting weight? Totally optional — you can always add it later.
            </p>
          </div>

          {adopt.isError && <ErrorText>{adopt.error.message}</ErrorText>}

          <div className={styles.revealActions}>
            <Button block onClick={handleStart} disabled={adopt.isPending || updateSettings.isPending}>
              {adopt.isPending || updateSettings.isPending ? 'Setting up...' : 'Start this plan'}
            </Button>
            <Button variant="secondary" block onClick={() => navigate('/train')}>
              See other plans
            </Button>
            <Button variant="ghost" block onClick={() => navigate('/')}>
              Skip for now
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [finished, setFinished] = useState(false);
  const step = STEPS[stepIndex];

  // Wait for existing settings to load so finishing the quiz can't
  // accidentally overwrite saved goals with blanks.
  if (isLoading) {
    return (
      <div className={styles.screen}>
        <Skeleton height={200} />
      </div>
    );
  }

  if (finished) return <RevealStep />;

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
      {
        onSuccess: () => {
          // Fresh answers mean fresh recommendations — clear the cached list
          // so the reveal shows the plan matched to what was just saved.
          queryClient.invalidateQueries({ queryKey: ['recommendedTemplates'] });
          setFinished(true);
        },
      }
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
          <Button type="submit">Next</Button>
        </form>
      ) : (
        <div className={styles.options}>
          {step.options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              className={styles.option}
              onClick={() => answer(opt.value)}
              disabled={updateSettings.isPending}
            >
              <span className={styles.optionLabel}>{opt.label}</span>
              {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
            </button>
          ))}
        </div>
      )}

      {updateSettings.isError && <ErrorText>{updateSettings.error.message}</ErrorText>}

      <div className={styles.footer}>
        {stepIndex > 0 && (
          <Button variant="ghost" onClick={() => setStepIndex(stepIndex - 1)}>
            Back
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate('/')}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
