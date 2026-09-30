import { useEffect, useRef, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import AiPlanButton from './AiPlanButton.jsx';
import PlanAdjustedNotice, { PlanAdjustsOn } from './PlanAdjustedNotice.jsx';
import PlanHistory from './PlanHistory.jsx';
import { Button, Card, Chip, ConfirmDialog, EmptyState, ErrorText, SectionTitle, Skeleton } from './ui/index.js';
import {
  CREATE_AI_PLAN_KEY,
  useAdoptTemplate,
  useAiPlanStatus,
  useDeleteMyPlan,
  useMyPlan,
  useRecommendedTemplates,
  useTemplates,
} from '../hooks/usePlans.js';
import styles from './PlanSection.module.css';
import { localToday } from '../lib/localDate.js';

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

// Where the plan came from: written by AI, or picked from the library.
function SourceChip({ source }) {
  if (source === 'ai') {
    return (
      <Chip tone="accent" title="Written for you by AI and adjusted weekly">
        AI plan
      </Chip>
    );
  }
  if (source === 'library') {
    return <Chip title="Picked from Cut's ready-made plans">Library plan</Chip>;
  }
  return null;
}

// onToast(message) — shows the screen's shared "it worked" toast.
export default function PlanSection({ onToast }) {
  const { data: plan, isLoading } = useMyPlan();
  const { data: aiPlan = { enabled: false, paid: false } } = useAiPlanStatus();
  const { data: recommended = [] } = useRecommendedTemplates();
  const { data: allTemplates = [] } = useTemplates();
  const adopt = useAdoptTemplate();
  const stopPlan = useDeleteMyPlan();
  const writingAiPlan = useIsMutating({ mutationKey: CREATE_AI_PLAN_KEY }) > 0;
  const [browsing, setBrowsing] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scrollToHistory, setScrollToHistory] = useState(false);
  const historyRef = useRef(null);

  // "See plan history": open it, then bring it into view once it's drawn.
  useEffect(() => {
    if (!scrollToHistory) return;
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToHistory(false);
  }, [scrollToHistory]);

  if (isLoading) return <Skeleton height={120} style={{ marginBottom: 'var(--space-4)' }} />;

  if (plan) {
    const showHistory = aiPlan.paid && plan.source === 'ai';
    return (
      <>
        <Card className={styles.card}>
          <div className={styles.planHeader}>
            <SectionTitle>Your plan — week {plan.weekNumber}</SectionTitle>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmingStop(true)}
              disabled={stopPlan.isPending}
            >
              Stop plan
            </Button>
            <ConfirmDialog
              open={confirmingStop}
              message="Stop this plan? Your program and logged sessions stay."
              confirmLabel="Stop plan"
              busy={stopPlan.isPending}
              onConfirm={() => {
                // Kept open (buttons disabled) until it's done, so the plan
                // can't be stopped twice by a double tap.
                stopPlan.mutate(undefined, { onSettled: () => setConfirmingStop(false) });
              }}
              onCancel={() => setConfirmingStop(false)}
            />
          </div>
          <div className={styles.planName}>
            {plan.name}
            <SourceChip source={plan.source} />
            {plan.deload && <Chip tone="accent">Easy week</Chip>}
          </div>
          {plan.source === 'ai' && <p className={styles.aiDisclosure}>This plan is written by AI.</p>}
          {showHistory && (
            <PlanAdjustedNotice
              plan={plan}
              onSeeHistory={() => {
                setHistoryOpen(true);
                setScrollToHistory(true);
              }}
            />
          )}
          {/* Only promise a date when the weekly adjustment can actually run. */}
          {showHistory && aiPlan.enabled && !writingAiPlan && <PlanAdjustsOn plan={plan} />}
          {/* While a new AI plan is being written, its loading shapes take
              the place of this week's guidance. */}
          {!writingAiPlan && (
            <>
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
            </>
          )}
          {aiPlan.paid && plan.source !== 'ai' && (
            <AiPlanButton
              enabled={aiPlan.enabled}
              lead="Want a plan written just for you?"
              variant="secondary"
              onReady={onToast}
            />
          )}
        </Card>
        {showHistory && (
          <PlanHistory ref={historyRef} open={historyOpen} onToggle={() => setHistoryOpen((o) => !o)} />
        )}
      </>
    );
  }

  const shown = browsing ? allTemplates : recommended;

  return (
    <Card className={styles.card} title={browsing ? 'All plans' : 'Recommended for you'}>
      {aiPlan.paid && (
        <div className={styles.aiRow}>
          <AiPlanButton
            enabled={aiPlan.enabled}
            lead="Skip the menu — let AI write your plan."
            variant="primary"
            onReady={onToast}
          />
        </div>
      )}
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
              onAdopt={() => adopt.mutate({ id: t.id, startDate: localToday() })}
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
