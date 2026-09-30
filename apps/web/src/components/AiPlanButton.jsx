import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ErrorText } from './ui/index.js';
import { useCreateAiPlan } from '../hooks/usePlans.js';
import { aiPlanErrorView } from '../lib/aiPlan.js';
import styles from './AiPlanButton.module.css';

// "Get my AI plan" for paid members. `enabled` is whether the AI is switched
// on at all; `lead` is the short muted line above the button; `onReady` is
// called with the toast text once the plan is written.
export default function AiPlanButton({ enabled, lead, variant = 'secondary', onReady }) {
  const queryClient = useQueryClient();
  const createAi = useCreateAiPlan();
  // Notes that keep the button off until the page reloads (already done this
  // week, today's limit, or switched off after all).
  const [heldNote, setHeldNote] = useState(null);
  const [failure, setFailure] = useState(null);

  const writing = createAi.isPending;
  const notEnabled = !enabled || heldNote?.kind === 'notEnabled';
  const disabled = writing || notEnabled || Boolean(heldNote);

  function handleClick() {
    setFailure(null);
    createAi.mutate(undefined, {
      onSuccess: () => onReady?.('Your AI plan is ready'),
      onError: (error) => {
        const view = aiPlanErrorView(error);
        if (view.kind === 'lostAccess') {
          // Their access changed: refresh the account so the button goes and
          // the upgrade card shows instead. No error text.
          queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
          queryClient.invalidateQueries({ queryKey: ['myPlan'] });
        } else if (view.kind === 'failed') {
          setFailure(view.message);
        } else {
          setHeldNote(view);
        }
      },
    });
  }

  return (
    <div className={styles.wrap}>
      {lead && <p className={styles.note}>{lead}</p>}
      <div className={styles.action}>
        <Button
          variant={variant}
          onClick={handleClick}
          disabled={disabled}
          title="Writes a new plan from your quiz and recent logs. Your current program stays saved."
        >
          {writing ? 'Writing your plan...' : 'Get my AI plan'}
        </Button>
      </div>

      <div aria-live="polite">
        {notEnabled && !heldNote && (
          <p className={styles.note}>The AI plan isn&apos;t switched on yet. Your library plan keeps working.</p>
        )}
        {heldNote && <p className={styles.note}>{heldNote.message}</p>}
        {failure && <ErrorText>{failure}</ErrorText>}
      </div>

      {writing && (
        <div className={styles.writing} aria-busy="true">
          <div className="skeleton" style={{ width: '50%', height: '1.125rem' }} />
          <div className="skeleton" style={{ width: '100%', height: '0.9rem' }} />
          <div className="skeleton" style={{ width: '90%', height: '0.9rem' }} />
          <div className="skeleton" style={{ width: '70%', height: '0.9rem' }} />
          <div className="skeleton" style={{ width: '5rem', height: '1.25rem', borderRadius: 'var(--radius-full)' }} />
          <p className={styles.note}>This can take up to 30 seconds. Keep this screen open.</p>
        </div>
      )}
    </div>
  );
}
