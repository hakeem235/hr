'use client';
import { useMemo } from 'react';
import type { StepDef, WorkflowDefinition } from '@/lib/types';
import styles from './WorkflowCanvas.module.css';

const NODE_W = 200;
const NODE_H = 76;
const GAP_X = 100;
const GAP_Y = 16;

interface NodePos {
  step: StepDef;
  col: number;
  row: number;
  x: number;
  y: number;
}

function computeLayout(steps: StepDef[]): NodePos[] {
  if (steps.length === 0) return [];

  // BFS to assign column depth
  const colMap = new Map<string, number>();
  const queue: string[] = [steps[0].id];
  colMap.set(steps[0].id, 0);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const step = steps.find((s) => s.id === id);
    if (!step) continue;
    const col = colMap.get(id)!;
    for (const t of step.transitions) {
      if (!colMap.has(t.to)) {
        colMap.set(t.to, col + 1);
        queue.push(t.to);
      }
    }
    if (step.type === 'branch') {
      for (const b of step.branches) {
        if (!colMap.has(b.to)) {
          colMap.set(b.to, col + 1);
          queue.push(b.to);
        }
      }
    }
  }

  // Assign steps without column (orphaned) to max col + 1
  const maxCol = Math.max(0, ...colMap.values());
  for (const s of steps) {
    if (!colMap.has(s.id)) colMap.set(s.id, maxCol + 1);
  }

  // Group by column
  const byCol = new Map<number, StepDef[]>();
  for (const s of steps) {
    const c = colMap.get(s.id) ?? 0;
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c)!.push(s);
  }

  const cols = [...byCol.keys()].sort((a, b) => a - b);
  const maxRows = Math.max(...[...byCol.values()].map((v) => v.length));
  const totalH = maxRows * (NODE_H + GAP_Y) - GAP_Y;

  const result: NodePos[] = [];
  for (const col of cols) {
    const colSteps = byCol.get(col)!;
    const colH = colSteps.length * (NODE_H + GAP_Y) - GAP_Y;
    const startY = (totalH - colH) / 2;
    colSteps.forEach((step, row) => {
      result.push({
        step,
        col,
        row,
        x: col * (NODE_W + GAP_X),
        y: startY + row * (NODE_H + GAP_Y),
      });
    });
  }
  return result;
}

const STEP_ICON: Record<StepDef['type'], string> = {
  approval: '▶',
  automated: '⚙',
  wait: '⏱',
  branch: '⑂',
  parallel: '∥',
  terminal: '◉',
};

const STEP_COLOR_CLASS: Record<StepDef['type'], string> = {
  approval: styles.colorApproval,
  automated: styles.colorAutomated,
  wait: styles.colorWait,
  branch: styles.colorBranch,
  parallel: styles.colorParallel,
  terminal: styles.colorTerminal,
};

function stepDescriptor(step: StepDef): string {
  switch (step.type) {
    case 'approval': return `${step.actor.strategy} · ${step.transitions.map((t) => t.on).join(', ')}`;
    case 'automated': return step.action;
    case 'wait': return step.signal ?? step.until ?? 'wait signal';
    case 'branch': return `${step.branches.length} branch${step.branches.length !== 1 ? 'es' : ''}`;
    case 'parallel': return `join: ${step.joinOn}`;
    case 'terminal': return step.result;
  }
}

interface WorkflowCanvasProps {
  definition: WorkflowDefinition;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onAddStep: (afterStepId: string) => void;
}

export function WorkflowCanvas({
  definition,
  selectedStepId,
  onSelectStep,
  onAddStep,
}: WorkflowCanvasProps) {
  const layout = useMemo(() => computeLayout(definition.steps), [definition.steps]);

  if (layout.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>No steps yet. Add a step to get started.</p>
      </div>
    );
  }

  const posMap = new Map(layout.map((n) => [n.step.id, n]));

  // Compute SVG dimensions
  const maxX = Math.max(...layout.map((n) => n.x)) + NODE_W;
  const maxY = Math.max(...layout.map((n) => n.y)) + NODE_H;
  const svgW = maxX + GAP_X;
  const svgH = maxY + GAP_Y;
  const PADDING = 40;

  // Build arrows
  const arrows: { key: string; d: string; label: string }[] = [];
  for (const node of layout) {
    const transitions =
      node.step.type === 'branch'
        ? node.step.branches.map((b) => ({ on: b.condition.slice(0, 12), to: b.to }))
        : node.step.transitions;
    for (const t of transitions) {
      const target = posMap.get(t.to);
      if (!target) continue;
      const x1 = node.x + NODE_W + PADDING;
      const y1 = node.y + NODE_H / 2 + PADDING;
      const x2 = target.x + PADDING;
      const y2 = target.y + NODE_H / 2 + PADDING;
      const cpX = 60;
      const d = `M ${x1} ${y1} C ${x1 + cpX} ${y1}, ${x2 - cpX} ${y2}, ${x2} ${y2}`;
      arrows.push({ key: `${node.step.id}->${t.to}`, d, label: t.on });
    }
  }

  return (
    <div className={styles.canvasContainer} role="region" aria-label="Workflow diagram">
      <div
        className={styles.canvas}
        style={{ width: svgW + PADDING * 2, height: svgH + PADDING * 2, position: 'relative' }}
      >
        {/* SVG arrows layer */}
        <svg
          className={styles.arrowsSvg}
          width={svgW + PADDING * 2}
          height={svgH + PADDING * 2}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#A39C88" />
            </marker>
          </defs>
          {arrows.map(({ key, d, label }) => (
            <g key={key}>
              <path d={d} fill="none" stroke="#C9C4B3" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
              <text
                x={0}
                y={0}
                className={styles.arrowLabel}
              >
                <textPath href={`#${key.replace(/[^a-zA-Z0-9]/g, '_')}`} startOffset="50%" textAnchor="middle">
                  {label}
                </textPath>
              </text>
              <path id={key.replace(/[^a-zA-Z0-9]/g, '_')} d={d} fill="none" stroke="none" />
            </g>
          ))}
        </svg>

        {/* HTML node overlays */}
        {layout.map((node) => {
          const isSelected = selectedStepId === node.step.id;
          const isTerminal = node.step.type === 'terminal';
          return (
            <div key={node.step.id}>
              <button
                className={[
                  styles.node,
                  STEP_COLOR_CLASS[node.step.type],
                  isSelected ? styles.nodeSelected : '',
                ].join(' ')}
                style={{
                  position: 'absolute',
                  insetInlineStart: node.x + PADDING,
                  insetBlockStart: node.y + PADDING,
                  width: NODE_W,
                  height: NODE_H,
                }}
                onClick={() => onSelectStep(node.step.id)}
                aria-pressed={isSelected}
                aria-label={`${node.step.type} step: ${node.step.id}`}
              >
                <span className={styles.nodeIcon} aria-hidden="true">
                  {STEP_ICON[node.step.type]}
                </span>
                <span className={styles.nodeBody}>
                  <span className={styles.nodeId}>{node.step.id}</span>
                  <span className={styles.nodeDesc}>{stepDescriptor(node.step)}</span>
                </span>
              </button>
              {!isTerminal && (
                <button
                  className={styles.addStepBtn}
                  style={{
                    position: 'absolute',
                    insetInlineStart: node.x + PADDING + NODE_W / 2 - 11,
                    insetBlockStart: node.y + PADDING + NODE_H + 2,
                  }}
                  onClick={() => onAddStep(node.step.id)}
                  aria-label={`Add step after ${node.step.id}`}
                  title="Add step"
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
