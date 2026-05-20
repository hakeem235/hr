'use client';
import { useCallback, useEffect, useState } from 'react';
import { TopBar } from '@/components/shell/TopBar';
import { WorkflowCanvas } from '@/components/workflow-builder/WorkflowCanvas';
import { StepEditor } from '@/components/workflow-builder/StepEditor';
import { fetchWorkflowDefinitions, saveWorkflowDefinition } from '@/lib/api';
import type { WorkflowDefinition, StepDef } from '@/lib/types';
import styles from './page.module.css';

// ── Mock fallback data ────────────────────────────────────────────────────────
const MOCK_DEFS: WorkflowDefinition[] = [
  {
    workflowId: 'leave-approval', version: 1, trigger: 'LeaveRequested',
    steps: [
      { id: 'manager-review', type: 'approval', actor: { strategy: 'reports_to', of: '$.employeeId' }, sla: { duration: 'PT8H', businessHours: true }, onTimeout: 'escalate', transitions: [{ on: 'approved', to: 'calendar-update' }, { on: 'declined', to: 'end_declined' }] },
      { id: 'calendar-update', type: 'automated', action: 'PublishEvent', params: { event: 'LeaveApproved' }, transitions: [{ on: 'success', to: 'end_approved' }] },
      { id: 'end_approved', type: 'terminal', result: 'approved', transitions: [] },
      { id: 'end_declined', type: 'terminal', result: 'declined', transitions: [] },
    ],
  },
  {
    workflowId: 'letter-approval', version: 1, trigger: 'LetterRequested',
    steps: [
      { id: 'hr-review', type: 'approval', actor: { strategy: 'role', role: 'hr_ops', scope: '$.entityId' }, sla: { duration: 'PT4H', businessHours: true }, onTimeout: 'auto-approve', transitions: [{ on: 'approved', to: 'generate-letter' }, { on: 'declined', to: 'end_declined' }] },
      { id: 'generate-letter', type: 'automated', action: 'PublishEvent', params: { event: 'LetterIssued' }, transitions: [{ on: 'success', to: 'end_approved' }] },
      { id: 'end_approved', type: 'terminal', result: 'approved', transitions: [] },
      { id: 'end_declined', type: 'terminal', result: 'declined', transitions: [] },
    ],
  },
];

const STEP_TYPES: StepDef['type'][] = ['approval', 'automated', 'wait', 'branch', 'parallel', 'terminal'];

function newStep(type: StepDef['type'], existingIds: string[]): StepDef {
  let id: string = type;
  let n = 1;
  while (existingIds.includes(id)) { id = `${type}-${n++}`; }

  switch (type) {
    case 'approval':
      return { id, type: 'approval', actor: { strategy: 'reports_to', of: '$.employeeId' }, transitions: [] };
    case 'automated':
      return { id, type: 'automated', action: '', params: {}, transitions: [] };
    case 'wait':
      return { id, type: 'wait', transitions: [] };
    case 'branch':
      return { id, type: 'branch', branches: [{ condition: '', to: '' }], transitions: [] };
    case 'parallel':
      return { id, type: 'parallel', branches: [], joinOn: 'all', transitions: [] };
    case 'terminal':
      return { id, type: 'terminal', result: 'completed', transitions: [] };
  }
}

export default function WorkflowsPage() {
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>(MOCK_DEFS);
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null);
  const [draft, setDraft] = useState<WorkflowDefinition | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [addStepMenuOpen, setAddStepMenuOpen] = useState(false);

  // Load definitions on mount
  useEffect(() => {
    fetchWorkflowDefinitions()
      .then((defs) => { if (defs.length > 0) setDefinitions(defs); })
      .catch(() => { /* keep mock data */ });
  }, []);

  function selectDefinition(def: WorkflowDefinition) {
    setSelected(def);
    setDraft(JSON.parse(JSON.stringify(def)) as WorkflowDefinition);
    setSelectedStepId(null);
    setDirty(false);
    setSaveError(null);
    setSaveSuccess(false);
  }

  function handleNewWorkflow() {
    const newDef: WorkflowDefinition = {
      workflowId: 'new-workflow',
      version: 0,
      trigger: '',
      steps: [],
    };
    setSelected(newDef);
    setDraft(JSON.parse(JSON.stringify(newDef)) as WorkflowDefinition);
    setSelectedStepId(null);
    setDirty(true);
    setSaveError(null);
    setSaveSuccess(false);
  }

  function handleUpdateDraft(updated: WorkflowDefinition) {
    setDraft(updated);
    setDirty(true);
    setSaveSuccess(false);
  }

  const handlePublish = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const { workflowId, trigger, steps } = draft;
      const saved = await saveWorkflowDefinition({ workflowId, trigger, steps });
      // Refresh definitions list
      const defs = await fetchWorkflowDefinitions().catch(() => definitions);
      if (defs.length > 0) setDefinitions(defs);
      setSelected(saved);
      setDraft(JSON.parse(JSON.stringify(saved)) as WorkflowDefinition);
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [draft, saving, definitions]);

  function handleAddStep(type: StepDef['type']) {
    if (!draft) return;
    const step = newStep(type, draft.steps.map((s) => s.id));
    const updated = { ...draft, steps: [...draft.steps, step] };
    handleUpdateDraft(updated);
    setSelectedStepId(step.id);
    setAddStepMenuOpen(false);
  }

  function handleAddStepAfter(afterStepId: string) {
    if (!draft) return;
    // Default to approval type for inline add
    const step = newStep('approval', draft.steps.map((s) => s.id));
    const updated = { ...draft, steps: [...draft.steps, step] };
    handleUpdateDraft(updated);
    setSelectedStepId(step.id);
  }

  return (
    <>
      <TopBar title="Workflow Builder" subtitle="Edit and publish approval workflow definitions" />

      <main className={styles.main} id="main-content" tabIndex={-1}>
        {/* ── Left sidebar ── */}
        <aside className={styles.sidebar} aria-label="Workflow definitions">
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Workflows</h2>
          </div>
          <ul className={styles.defList} role="list">
            {definitions.map((def) => {
              const isActive = selected?.workflowId === def.workflowId;
              return (
                <li key={def.workflowId}>
                  <button
                    className={styles.defItem}
                    aria-pressed={isActive}
                    onClick={() => selectDefinition(def)}
                  >
                    <span className={styles.defName}>{def.workflowId}</span>
                    <span className={styles.versionBadge}>v{def.version}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className={styles.sidebarFooter}>
            <button className={styles.newWorkflowBtn} onClick={handleNewWorkflow}>
              + New workflow
            </button>
          </div>
        </aside>

        {/* ── Center canvas ── */}
        <div className={styles.canvasArea}>
          {/* Top toolbar */}
          {draft && (
            <div className={styles.toolbar} role="toolbar" aria-label="Workflow toolbar">
              <input
                className={styles.workflowNameInput}
                value={draft.workflowId}
                onChange={(e) => handleUpdateDraft({ ...draft, workflowId: e.target.value })}
                aria-label="Workflow name"
              />
              <span className={styles.versionBadgeToolbar} aria-label={`Version ${draft.version}, will save as v${draft.version + 1}`}>
                v{draft.version} → v{draft.version + 1}
              </span>

              <div className={styles.toolbarActions}>
                {/* Add step dropdown */}
                <div className={styles.addStepDropdown}>
                  <button
                    className={styles.addStepTrigger}
                    onClick={() => setAddStepMenuOpen((o) => !o)}
                    aria-haspopup="true"
                    aria-expanded={addStepMenuOpen}
                  >
                    Add step ▾
                  </button>
                  {addStepMenuOpen && (
                    <ul className={styles.addStepMenu} role="menu" aria-label="Step types">
                      {STEP_TYPES.map((type) => (
                        <li key={type} role="none">
                          <button
                            role="menuitem"
                            className={styles.addStepMenuItem}
                            onClick={() => handleAddStep(type)}
                          >
                            {type}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  className={styles.publishBtn}
                  onClick={handlePublish}
                  disabled={saving || !dirty}
                  aria-busy={saving}
                >
                  {saving ? 'Saving…' : saveSuccess ? 'Saved ✓' : 'Publish new version'}
                </button>
              </div>

              {saveError && (
                <p className={styles.saveError} role="alert">{saveError}</p>
              )}
            </div>
          )}

          {/* Canvas */}
          {draft ? (
            <div className={styles.canvasWrapper}>
              <WorkflowCanvas
                definition={draft}
                selectedStepId={selectedStepId}
                onSelectStep={setSelectedStepId}
                onAddStep={handleAddStepAfter}
              />
            </div>
          ) : (
            <div className={styles.emptyCanvas} role="status">
              <div className={styles.emptyIcon} aria-hidden="true">◈</div>
              <p className={styles.emptyTitle}>No workflow selected</p>
              <p className={styles.emptySub}>
                Select a workflow from the sidebar, or create a new one.
              </p>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        {draft && (
          <StepEditor
            draft={draft}
            selectedStepId={selectedStepId}
            onUpdateDraft={handleUpdateDraft}
          />
        )}
      </main>
    </>
  );
}
