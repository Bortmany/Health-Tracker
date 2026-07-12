import { useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorText, SectionTitle, Skeleton } from './ui/index.js';
import { useAdoptTemplate, useDeleteMyPlan, useMyPlan, useRecommendedTemplates, useTemplates } from '../hooks/usePlans.js';
import styles from './PlanSection.module.css';

function TemplateCard({ template, onAdopt, adopting }) {
  return (
    <div className={styles.templateCard}>
      <div className={styles.templateName}>{template.name}</div>
      <p className={styles.templateDescription}>{template.description}</p>
      <div className={styles.tagRow}>
        <Chip>{template.goal}</Chip>
        <Chip>{template.experience}</Chip>
        <Chip>{template.daysPerWeek} days/week</Chip>
      </div>
      <Button variant="primary" size="sm" onClick={onAdopt} disabled={adopting}>
        {adopting ? 'Setting up...' : 'Use this plan'}
      </Button>
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

  if (isLoading) return <Skeleton height={120} style={{ marginBottom: 'var(--space-4)' }} />;

  if (plan) {
    return (
      <Card className={styles.card}>
        <div className={styles.planHeader}>
          <SectionTitle>
            Your plan — week {plan.weekNumber} of {plan.durationWeeks}
          </SectionTitle>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (window.confirm('Stop this plan? Your program and logged sessions stay.')) {
                stopPlan.mutate();
              }
            }}
          >
            Stop plan
          </Button>
        </div>
        <div className={styles.planName}>
          {plan.name}
          {plan.deload && <Chip tone="accent">Easy week</Chip>}
        </div>
        {/* The plain-English progression note gets its own prominent line. */}
        <p className={styles.guidance}>
          {plan.completed
            ? 'Plan complete — great work! Pick a new plan below or keep training freestyle.'
            : plan.guidance}
        </p>
        {plan.phase && (
          <p className={styles.phase}>
            Phase: <strong>{plan.phase.name}</strong> — {plan.phase.focus}
          </p>
        )}
      </Card>
    );
  }

  const shown = browsing ? allTemplates : recommended;

  return (
    <Card className={styles.card} title={browsing ? 'All plans' : 'Recommended for you'}>
      {adopt.isError && <ErrorText>{adopt.error.message}</ErrorText>}
      {shown.length === 0 ? (
        <EmptyState>No matching plans yet. Fill in the quiz under More to get recommendations.</EmptyState>
      ) : (
        <div className={styles.templateList}>
          {shown.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              adopting={adopt.isPending && adopt.variables?.id === t.id}
              onAdopt={() => adopt.mutate({ id: t.id, startDate: new Date().toLocaleDateString('en-CA') })}
            />
          ))}
        </div>
      )}
      <div className={styles.browseRow}>
        <Button variant="ghost" block onClick={() => setBrowsing((b) => !b)}>
          {browsing ? 'Show recommendations' : 'Browse all plans'}
        </Button>
      </div>
    </Card>
  );
}
