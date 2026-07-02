import { useState } from 'react';
import { useAdoptTemplate, useDeleteMyPlan, useMyPlan, useRecommendedTemplates, useTemplates } from '../hooks/usePlans.js';
import styles from './PlanSection.module.css';

function TemplateCard({ template, onAdopt, adopting }) {
  return (
    <div className={styles.templateCard}>
      <div className={styles.templateName}>{template.name}</div>
      <p className={styles.templateDescription}>{template.description}</p>
      <div className={styles.tagRow}>
        <span className={styles.tag}>{template.goal}</span>
        <span className={styles.tag}>{template.experience}</span>
        <span className={styles.tag}>{template.daysPerWeek} days/week</span>
      </div>
      <button type="button" className={styles.adoptButton} onClick={onAdopt} disabled={adopting}>
        {adopting ? 'Setting up...' : 'Use this plan'}
      </button>
    </div>
  );
}

export default function PlanSection() {
  const { data: plan, isLoading } = useMyPlan();
  const { data: recommended = [] } = useRecommendedTemplates();
  const { data: allTemplates = [] } = useTemplates();
  const adopt = useAdoptTemplate();
  const stopPlan = useDeleteMyPlan();
  const [browsing, setBrowsing] = useState(false);

  if (isLoading) return <div className="skeleton" style={{ height: 120, marginBottom: '1rem' }} />;

  if (plan) {
    return (
      <section className={styles.section}>
        <div className={styles.planHeader}>
          <h2 className={styles.sectionTitle}>
            Your plan — week {plan.weekNumber} of {plan.durationWeeks}
          </h2>
          <button
            type="button"
            className={styles.stopButton}
            onClick={() => {
              if (window.confirm('Stop this plan? Your program and logged sessions stay.')) {
                stopPlan.mutate();
              }
            }}
          >
            Stop plan
          </button>
        </div>
        <div className={styles.planName}>{plan.name}</div>
        {plan.phase && (
          <p className={styles.phase}>
            Phase: <strong>{plan.phase.name}</strong> — {plan.phase.focus}
          </p>
        )}
        {plan.deload && <span className={styles.deloadBadge}>Easy week</span>}
        <p className={styles.guidance}>{plan.completed ? 'Plan complete — great work! Pick a new plan below or keep training freestyle.' : plan.guidance}</p>
      </section>
    );
  }

  const shown = browsing ? allTemplates : recommended;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{browsing ? 'All plans' : 'Recommended for you'}</h2>
      {adopt.isError && <p className={styles.error}>{adopt.error.message}</p>}
      {shown.length === 0 ? (
        <p className={styles.empty}>
          No matching plans yet. Fill in the quiz under More to get recommendations.
        </p>
      ) : (
        <div className={styles.templateList}>
          {shown.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              adopting={adopt.isPending && adopt.variables?.id === t.id}
              onAdopt={() => adopt.mutate({ id: t.id })}
            />
          ))}
        </div>
      )}
      <button type="button" className={styles.browseButton} onClick={() => setBrowsing((b) => !b)}>
        {browsing ? 'Show recommendations' : 'Browse all plans'}
      </button>
    </section>
  );
}
