'use client';
import type {
  StepDef, WorkflowDefinition, ActorSpec, Transition,
  ApprovalStep, AutomatedStep, WaitStep, BranchStep, ParallelStep, TerminalStep,
} from '@/lib/types';
import styles from './StepEditor.module.css';

interface StepEditorProps {
  draft: WorkflowDefinition;
  selectedStepId: string | null;
  onUpdateDraft: (updated: WorkflowDefinition) => void;
}

function cloneDraft(draft: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(draft)) as WorkflowDefinition;
}

export function StepEditor({ draft, selectedStepId, onUpdateDraft }: StepEditorProps) {
  const stepIndex = draft.steps.findIndex((s) => s.id === selectedStepId);
  const step = stepIndex >= 0 ? draft.steps[stepIndex] : null;

  const allStepIds = draft.steps.map((s) => s.id);

  function updateStep(updated: StepDef) {
    const next = cloneDraft(draft);
    next.steps[stepIndex] = updated;
    onUpdateDraft(next);
  }

  function updateField<K extends keyof StepDef>(key: K, value: StepDef[K]) {
    if (!step) return;
    updateStep({ ...step, [key]: value } as StepDef);
  }

  // Check if any other step has a transition to this step
  const hasInboundTransitions = step
    ? draft.steps.some((s) =>
        s.id !== step.id &&
        s.transitions.some((t) => t.to === step.id) ||
        (s.type === 'branch' && s.branches?.some((b) => b.to === step.id))
      )
    : false;

  function handleDeleteStep() {
    if (!step) return;
    const next = cloneDraft(draft);
    next.steps = next.steps.filter((s) => s.id !== step.id);
    onUpdateDraft(next);
  }

  function updateTransition(idx: number, field: keyof Transition, value: string) {
    if (!step) return;
    const transitions = [...step.transitions] as Transition[];
    transitions[idx] = { ...transitions[idx], [field]: value };
    updateStep({ ...step, transitions } as StepDef);
  }

  function addTransition() {
    if (!step) return;
    const transitions = [...step.transitions, { on: '', to: '' }] as Transition[];
    updateStep({ ...step, transitions } as StepDef);
  }

  function removeTransition(idx: number) {
    if (!step) return;
    const transitions = step.transitions.filter((_, i) => i !== idx) as Transition[];
    updateStep({ ...step, transitions } as StepDef);
  }

  // ── Workflow metadata panel (no step selected) ──────────────────────────────
  if (!step) {
    return (
      <aside className={styles.panel} aria-label="Workflow metadata">
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Workflow Info</h3>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="meta-id">Workflow ID</label>
            <input
              id="meta-id"
              className={styles.input}
              value={draft.workflowId}
              onChange={(e) => onUpdateDraft({ ...draft, workflowId: e.target.value })}
              placeholder="e.g. leave-approval"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="meta-trigger">Trigger Event</label>
            <input
              id="meta-trigger"
              className={styles.input}
              value={draft.trigger}
              onChange={(e) => onUpdateDraft({ ...draft, trigger: e.target.value })}
              placeholder="e.g. LeaveRequested"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Version</label>
            <p className={styles.readOnly}>v{draft.version} → will save as v{draft.version + 1}</p>
          </div>
          <p className={styles.hint}>Select a step node to edit its properties.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.panel} aria-label="Step editor">
      <div className={styles.panelHeader}>
        <span className={styles.stepTypeBadge} data-type={step.type}>{step.type}</span>
        <h3 className={styles.panelTitle}>Edit Step</h3>
      </div>

      <div className={styles.panelBody}>
        {/* ── Common fields ── */}
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="step-id">Step ID</label>
          <input
            id="step-id"
            className={styles.input}
            value={step.id}
            onChange={(e) => updateField('id', e.target.value)}
            placeholder="e.g. manager-review"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="step-condition">
            Condition <span className={styles.optional}>(optional)</span>
          </label>
          <input
            id="step-condition"
            className={styles.input}
            value={(step as ApprovalStep).condition ?? ''}
            onChange={(e) => updateField('condition' as keyof StepDef, e.target.value || undefined as unknown as string)}
            placeholder="e.g. $.request.days > 5"
          />
        </div>

        {step.type !== 'terminal' && (
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="step-onSkip">
              On Skip <span className={styles.optional}>(step ID)</span>
            </label>
            <select
              id="step-onSkip"
              className={styles.input}
              value={(step as ApprovalStep).onSkip ?? ''}
              onChange={(e) => updateField('onSkip' as keyof StepDef, e.target.value || undefined as unknown as string)}
            >
              <option value="">— none —</option>
              {allStepIds.filter((id) => id !== step.id).map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Type-specific fields ── */}
        {step.type === 'approval' && (
          <ApprovalFields step={step} onUpdate={(s) => updateStep(s)} />
        )}
        {step.type === 'automated' && (
          <AutomatedFields step={step} onUpdate={(s) => updateStep(s)} />
        )}
        {step.type === 'wait' && (
          <WaitFields step={step} onUpdate={(s) => updateStep(s)} />
        )}
        {step.type === 'branch' && (
          <BranchFields step={step} allStepIds={allStepIds} onUpdate={(s) => updateStep(s)} />
        )}
        {step.type === 'parallel' && (
          <ParallelFields step={step} onUpdate={(s) => updateStep(s)} />
        )}
        {step.type === 'terminal' && (
          <TerminalFields step={step} onUpdate={(s) => updateStep(s)} />
        )}

        {/* ── Transitions ── */}
        {step.type !== 'terminal' && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>Transitions</h4>
            {step.transitions.map((t, idx) => (
              <div key={idx} className={styles.transitionRow}>
                <input
                  className={styles.inputSm}
                  value={t.on}
                  onChange={(e) => updateTransition(idx, 'on', e.target.value)}
                  placeholder="on (event)"
                  aria-label="Transition event"
                />
                <select
                  className={styles.inputSm}
                  value={t.to}
                  onChange={(e) => updateTransition(idx, 'to', e.target.value)}
                  aria-label="Transition target step"
                >
                  <option value="">— to step —</option>
                  {allStepIds.filter((id) => id !== step.id).map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <button
                  className={styles.removeBtn}
                  onClick={() => removeTransition(idx)}
                  aria-label={`Remove transition ${idx + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button className={styles.addRowBtn} onClick={addTransition}>
              + Add transition
            </button>
          </section>
        )}

        {/* ── Delete step ── */}
        <div className={styles.deleteZone}>
          <button
            className={styles.deleteBtn}
            onClick={handleDeleteStep}
            disabled={hasInboundTransitions}
            aria-disabled={hasInboundTransitions}
            title={hasInboundTransitions ? 'Remove all inbound transitions before deleting' : undefined}
          >
            Delete step
          </button>
          {hasInboundTransitions && (
            <p className={styles.deleteHint}>Remove inbound transitions first</p>
          )}
        </div>
      </div>
    </aside>
  );
}

// ── Sub-editors ──────────────────────────────────────────────────────────────

function ApprovalFields({ step, onUpdate }: { step: ApprovalStep; onUpdate: (s: ApprovalStep) => void }) {
  const actor = step.actor ?? { strategy: 'reports_to' };

  function updateActor(field: keyof ActorSpec, value: string) {
    onUpdate({ ...step, actor: { ...actor, [field]: value || undefined } });
  }

  return (
    <>
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Actor</h4>
        <div className={styles.fieldGroup}>
          <fieldset className={styles.radioGroup}>
            <legend className={styles.label}>Strategy</legend>
            {(['reports_to', 'role', 'named', 'dynamic'] as const).map((s) => (
              <label key={s} className={styles.radioLabel}>
                <input
                  type="radio"
                  name="actor-strategy"
                  value={s}
                  checked={actor.strategy === s}
                  onChange={() => updateActor('strategy', s)}
                />
                {s.replace(/_/g, ' ')}
              </label>
            ))}
          </fieldset>
        </div>
        {actor.strategy === 'reports_to' && (
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="actor-of">Context path (of)</label>
            <input id="actor-of" className={styles.input} value={actor.of ?? ''} onChange={(e) => updateActor('of', e.target.value)} placeholder="$.employeeId" />
          </div>
        )}
        {actor.strategy === 'role' && (
          <>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="actor-role">Role</label>
              <input id="actor-role" className={styles.input} value={actor.role ?? ''} onChange={(e) => updateActor('role', e.target.value)} placeholder="hr_ops" />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="actor-scope">Scope</label>
              <input id="actor-scope" className={styles.input} value={actor.scope ?? ''} onChange={(e) => updateActor('scope', e.target.value)} placeholder="$.entityId" />
            </div>
          </>
        )}
        {actor.strategy === 'named' && (
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="actor-empid">Employee ID</label>
            <input id="actor-empid" className={styles.input} value={actor.employeeId ?? ''} onChange={(e) => updateActor('employeeId', e.target.value)} placeholder="emp_001" />
          </div>
        )}
        {actor.strategy === 'dynamic' && (
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="actor-dyn">Context path (of)</label>
            <input id="actor-dyn" className={styles.input} value={actor.of ?? ''} onChange={(e) => updateActor('of', e.target.value)} placeholder="$.approver" />
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>SLA</h4>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="sla-duration">Duration (ISO 8601)</label>
          <input
            id="sla-duration"
            className={styles.input}
            value={step.sla?.duration ?? ''}
            onChange={(e) => onUpdate({ ...step, sla: { ...step.sla, duration: e.target.value, businessHours: step.sla?.businessHours ?? true } })}
            placeholder="PT8H"
          />
        </div>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={step.sla?.businessHours ?? true}
            onChange={(e) => onUpdate({ ...step, sla: { ...step.sla, duration: step.sla?.duration ?? '', businessHours: e.target.checked } })}
          />
          Business hours only
        </label>
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="on-timeout">On timeout</label>
          <select
            id="on-timeout"
            className={styles.input}
            value={step.onTimeout ?? ''}
            onChange={(e) => onUpdate({ ...step, onTimeout: (e.target.value || undefined) as ApprovalStep['onTimeout'] })}
          >
            <option value="">— none —</option>
            <option value="escalate">escalate</option>
            <option value="auto-approve">auto-approve</option>
            <option value="notify-only">notify-only</option>
          </select>
        </div>
      </section>
    </>
  );
}

function AutomatedFields({ step, onUpdate }: { step: AutomatedStep; onUpdate: (s: AutomatedStep) => void }) {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>Action</h4>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="auto-action">Action name</label>
        <input id="auto-action" className={styles.input} value={step.action} onChange={(e) => onUpdate({ ...step, action: e.target.value })} placeholder="PublishEvent" />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="auto-params">Params (JSON)</label>
        <textarea
          id="auto-params"
          className={styles.textarea}
          value={JSON.stringify(step.params, null, 2)}
          onChange={(e) => {
            try { onUpdate({ ...step, params: JSON.parse(e.target.value) as Record<string, unknown> }); } catch { /* ignore parse errors */ }
          }}
          rows={4}
        />
      </div>
    </section>
  );
}

function WaitFields({ step, onUpdate }: { step: WaitStep; onUpdate: (s: WaitStep) => void }) {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>Wait</h4>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="wait-until">Until (ISO or expression)</label>
        <input id="wait-until" className={styles.input} value={step.until ?? ''} onChange={(e) => onUpdate({ ...step, until: e.target.value || undefined })} placeholder="$.deadline" />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="wait-signal">Signal</label>
        <input id="wait-signal" className={styles.input} value={step.signal ?? ''} onChange={(e) => onUpdate({ ...step, signal: e.target.value || undefined })} placeholder="PaymentConfirmed" />
      </div>
    </section>
  );
}

function BranchFields({ step, allStepIds, onUpdate }: { step: BranchStep; allStepIds: string[]; onUpdate: (s: BranchStep) => void }) {
  function updateBranch(idx: number, field: 'condition' | 'to', value: string) {
    const branches = step.branches.map((b, i) => i === idx ? { ...b, [field]: value } : b);
    onUpdate({ ...step, branches });
  }
  function addBranch() { onUpdate({ ...step, branches: [...step.branches, { condition: '', to: '' }] }); }
  function removeBranch(idx: number) { onUpdate({ ...step, branches: step.branches.filter((_, i) => i !== idx) }); }

  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>Branches</h4>
      {step.branches.map((b, idx) => (
        <div key={idx} className={styles.transitionRow}>
          <input className={styles.inputSm} value={b.condition} onChange={(e) => updateBranch(idx, 'condition', e.target.value)} placeholder="condition" aria-label="Branch condition" />
          <select className={styles.inputSm} value={b.to} onChange={(e) => updateBranch(idx, 'to', e.target.value)} aria-label="Branch target">
            <option value="">— to —</option>
            {allStepIds.filter((id) => id !== step.id).map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <button className={styles.removeBtn} onClick={() => removeBranch(idx)} aria-label={`Remove branch ${idx + 1}`}>✕</button>
        </div>
      ))}
      <button className={styles.addRowBtn} onClick={addBranch}>+ Add branch</button>
    </section>
  );
}

function ParallelFields({ step, onUpdate }: { step: ParallelStep; onUpdate: (s: ParallelStep) => void }) {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>Parallel</h4>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="par-branches">Branch step IDs (comma-separated)</label>
        <input id="par-branches" className={styles.input} value={step.branches.join(', ')} onChange={(e) => onUpdate({ ...step, branches: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="step-a, step-b" />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="par-joinOn">Join on</label>
        <select id="par-joinOn" className={styles.input} value={step.joinOn} onChange={(e) => onUpdate({ ...step, joinOn: e.target.value as 'all' | 'any' })}>
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
      </div>
    </section>
  );
}

function TerminalFields({ step, onUpdate }: { step: TerminalStep; onUpdate: (s: TerminalStep) => void }) {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>Terminal</h4>
      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="term-result">Result</label>
        <input id="term-result" className={styles.input} value={step.result} onChange={(e) => onUpdate({ ...step, result: e.target.value })} placeholder="approved" />
      </div>
    </section>
  );
}
