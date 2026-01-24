import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Boxes,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  Code,
  Columns3,
  Database,
  GitBranch,
  GitCommit,
  Grid2X2,
  LayoutGrid,
  Layers,
  LineChart,
  Package,
  PieChart,
  Route,
  Share2,
  Shuffle,
  Target,
  Workflow,
} from 'lucide-react';
import type { DiagramType } from '../../types';
import { DIAGRAM_TYPE_LABELS, getDiagramTypeShortLabel } from '../../utils/diagramTypeMeta';
import { DIAGRAM_TYPES, MAIN_DIAGRAM_TYPES } from '../../utils/diagramTypes';
import { CONTROL_BASE, HEADER_CONTROL_BUTTON } from '../../utils/uiControlStyles';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

type DiagramTypePickerProps = {
  placement: 'expanded' | 'active';
  isOpen: boolean;
  diagramType: DiagramType;
  mainDiagramTypes: DiagramType[];
  onDiagramTypeChange: (type: DiagramType) => void;
  onMainDiagramTypesChange: (types: DiagramType[]) => void;
  notebookBuildCount: number | string | null;
  onNotebookBuildCountChange: (count: number | string | null) => void;
  onToggleOpen: (placement: 'expanded' | 'active') => void;
  onRootRef?: (node: HTMLDivElement | null) => void;
};

const NOTEBOOK_COUNT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'auto', value: 'auto' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '4', value: '4' },
  { label: '5', value: '5' },
  { label: '2-3', value: '2-3' },
  { label: '4-6', value: '4-6' },
  { label: '7-10', value: '7-10' },
  { label: '12-16', value: '12-16' },
];

const DIAGRAM_TYPE_SETS: Array<{
  id: string;
  label: string;
  types: DiagramType[];
  group: 'main' | 'more';
  description?: string;
  tooltip?: string;
}> = [
  {
    id: 'set-main',
    label: 'Main',
    types: ['flowchart', 'er', 'sequence'],
    group: 'main',
    description: 'Flowchart + ER + Sequence.',
    tooltip: 'The default trio: process/structure (Flowchart), data model (ER), and interactions over time (Sequence).',
  },
  {
    id: 'set-fc-sd',
    label: 'FC+SD',
    types: ['flowchart', 'sequence'],
    group: 'main',
    description: 'Flowchart + Sequence.',
    tooltip: 'Best for workflows + conversations: Flowchart for the process, Sequence for who talks to whom and when.',
  },
  {
    id: 'set-fc-er',
    label: 'FC+ER',
    types: ['flowchart', 'er'],
    group: 'main',
    description: 'Flowchart + ER.',
    tooltip: 'Best for systems/data: Flowchart for the flow, ER for entities + relationships.',
  },

  {
    id: 'set-main-plus',
    label: 'Main+',
    types: ['flowchart', 'er', 'sequence', 'state'],
    group: 'more',
    description: 'Default + State (behavior).',
    tooltip: 'Main + State: add a state machine to describe behavior/transitions alongside flow, data, and interactions.',
  },
  {
    id: 'set-behavior',
    label: 'Behavior',
    types: ['state', 'sequence', 'flowchart'],
    group: 'more',
    description: 'State machine + interactions + branches.',
    tooltip: 'When behavior matters: state transitions, sequences of messages, and a flowchart for branching paths.',
  },
  {
    id: 'set-arch',
    label: 'Architecture',
    types: ['c4', 'sequence'],
    group: 'more',
    description: 'High-level structure + key interactions.',
    tooltip: 'Architecture view: C4 for structure/containers + Sequence for the critical request/response paths.',
  },
  {
    id: 'set-user-flow',
    label: 'User Flow',
    types: ['flowchart', 'userJourney'],
    group: 'more',
    description: 'Process + user journey stages.',
    tooltip: 'Product UX: flowchart for the process + user journey for the experience across stages.',
  },
  {
    id: 'set-ops',
    label: 'Ops',
    types: ['flowchart', 'gantt'],
    group: 'more',
    description: 'Process + timeline/schedule.',
    tooltip: 'Execution view: flowchart for the flow + gantt for timeline/dependencies.',
  },
];

const getDiagramTypeIcon = (type: DiagramType) => {
  switch (type) {
    case 'flowchart':
      return <GitBranch size={12} />;
    case 'sequence':
      return <ArrowLeftRight size={12} />;
    case 'er':
      return <Database size={12} />;
    case 'gantt':
      return <CalendarRange size={12} />;
    case 'gitGraph':
      return <GitCommit size={12} />;
    case 'class':
      return <Boxes size={12} />;
    case 'state':
      return <Workflow size={12} />;
    case 'block':
      return <LayoutGrid size={12} />;
    case 'c4':
      return <Layers size={12} />;
    case 'kanban':
      return <Columns3 size={12} />;
    case 'mindmap':
      return <Share2 size={12} />;
    case 'packet':
      return <Package size={12} />;
    case 'pie':
      return <PieChart size={12} />;
    case 'quadrantChart':
      return <Grid2X2 size={12} />;
    case 'radar':
      return <Target size={12} />;
    case 'requirementDiagram':
      return <ClipboardList size={12} />;
    case 'sankey':
      return <Shuffle size={12} />;
    case 'timeline':
      return <CalendarRange size={12} />;
    case 'treemap':
      return <LayoutGrid size={12} />;
    case 'userJourney':
      return <Route size={12} />;
    case 'xychart':
      return <LineChart size={12} />;
    case 'zenuml':
      return <Code size={12} />;
    default:
      return <Boxes size={12} />;
  }
};

const DiagramTypePicker: React.FC<DiagramTypePickerProps> = ({
  placement,
  isOpen,
  diagramType,
  mainDiagramTypes,
  onDiagramTypeChange,
  onMainDiagramTypesChange,
  notebookBuildCount,
  onNotebookBuildCountChange,
  onToggleOpen,
  onRootRef,
}) => {
  const [isMoreDiagramTypeSetsOpen, setIsMoreDiagramTypeSetsOpen] = useState(false);
  const [diagramTypePickerStatusText, setDiagramTypePickerStatusText] = useState('');
  const mainTypeList = (mainDiagramTypes?.length ? mainDiagramTypes : [...MAIN_DIAGRAM_TYPES])
    .filter((t) => t !== 'auto');
  const isSingleMode = diagramType !== 'auto';
  const selectedNotebookCountValue = notebookBuildCount === null
    ? 'auto'
    : typeof notebookBuildCount === 'number'
      ? String(notebookBuildCount)
      : notebookBuildCount;
  const currentDiagramTypeSelection = useMemo(() => {
    const base = diagramType === 'auto' ? [...mainTypeList] : [diagramType];
    const sanitized = base.filter((t) => t !== 'auto');
    return sanitized.length ? sanitized : [...MAIN_DIAGRAM_TYPES];
  }, [diagramType, mainTypeList]);

  const handleToggleOpen = () => {
    setIsMoreDiagramTypeSetsOpen(false);
    setDiagramTypePickerStatusText('');
    onToggleOpen(placement);
  };

  const toggleDiagramTypeInPicker = (type: DiagramType) => {
    const has = currentDiagramTypeSelection.includes(type);
    const next = has
      ? currentDiagramTypeSelection.filter((t) => t !== type)
      : [...currentDiagramTypeSelection, type];
    if (!next.length) return;
    if (next.length === 1) {
      onDiagramTypeChange(next[0]);
      return;
    }
    onMainDiagramTypesChange(next);
    onDiagramTypeChange('auto');
  };

  const applyDiagramTypeSet = (types: DiagramType[]) => {
    const sanitized = types.filter((t) => t !== 'auto');
    if (!sanitized.length) return;
    onMainDiagramTypesChange(sanitized);
    if (sanitized.length === 1) {
      onDiagramTypeChange(sanitized[0]);
    } else {
      onDiagramTypeChange('auto');
    }
  };

  const renderDiagramTypeSelectorControl = () => {
    const selectedTypes = diagramType === 'auto' ? mainTypeList : [diagramType];
    const overflowCount = Math.max(0, selectedTypes.length - 4);
    const visibleTypes = selectedTypes.slice(0, 4);
    const title =
      diagramType === 'auto'
        ? `Main (${selectedTypes.join(', ')})`
        : (DIAGRAM_TYPE_LABELS[diagramType] ?? diagramType);
    const showCountInline = !isSingleMode && placement === 'active';

    return (
      <div
        className={`${HEADER_CONTROL_BUTTON} w-auto justify-end gap-2`}
        title={title}
      >
        <div className="flex items-center gap-1 min-w-0 mr-auto">
          {visibleTypes.map((type) => (
            <span
              key={type}
              className="inline-flex items-center justify-center w-6 h-6 rounded border border-[var(--panel-border)] bg-[var(--control-bg)] text-[var(--control-muted-text)] hover:bg-[var(--control-bg-hover)]"
              title={DIAGRAM_TYPE_LABELS[type] ?? type}
              aria-label={DIAGRAM_TYPE_LABELS[type] ?? type}
            >
              {getDiagramTypeIcon(type)}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400 px-1.5">
              +{overflowCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Button
            type="button"
            onClick={handleToggleOpen}
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900"
            aria-label="Open diagram type picker"
          >
            <ChevronDown size={12} className="opacity-70" />
          </Button>
          {showCountInline && (
            <Select
              value={selectedNotebookCountValue}
              onChange={(e) => {
                const next = e.target.value;
                if (next === 'auto') {
                  onNotebookBuildCountChange(null);
                  return;
                }
                if (/^\d+$/.test(next)) {
                  onNotebookBuildCountChange(Number(next));
                  return;
                }
                onNotebookBuildCountChange(next);
              }}
              size="xs"
              className="w-16 h-6 px-1 text-[10px]"
              title="Count"
              aria-label="Count"
            >
              {NOTEBOOK_COUNT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>
    );
  };

  const renderDiagramTypePicker = () => {
    if (!isOpen) return null;
    const mainSets = DIAGRAM_TYPE_SETS.filter((set) => set.group === 'main');
    const moreSets = DIAGRAM_TYPE_SETS.filter((set) => set.group === 'more');
    const pickerPositionClass = placement === 'active' ? 'right-0' : 'left-0';
    const allSets = [...mainSets, ...moreSets];
    return (
      <div
        className={`absolute ${pickerPositionClass} top-full z-50 mt-1 w-[min(22rem,90vw)] rounded-md border border-[var(--panel-border)] bg-[var(--menu-bg)] shadow-lg`}
      >
        <div className="overflow-x-hidden px-2 py-2">
          <div className="mb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Sets</span>
              <Button
                type="button"
                onClick={() => setIsMoreDiagramTypeSetsOpen((prev) => !prev)}
                aria-pressed={isMoreDiagramTypeSetsOpen}
                variant="ghost"
                className={`h-auto px-1 py-0 text-[10px] ${
                  isMoreDiagramTypeSetsOpen
                    ? 'text-slate-800 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {isMoreDiagramTypeSetsOpen ? 'Less…' : 'More…'}
                <ChevronDown
                  size={10}
                  className={`opacity-70 transition-transform ${isMoreDiagramTypeSetsOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </div>
            <div
              className="mt-1 h-7 text-[10px] text-slate-600 dark:text-slate-300 leading-snug break-words overflow-hidden"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {diagramTypePickerStatusText}
            </div>
            {!isMoreDiagramTypeSetsOpen ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {mainSets.map((set) => (
                  <Button
                    key={set.id}
                    type="button"
                    onClick={() => applyDiagramTypeSet(set.types)}
                    className="relative group inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-[var(--control-text)] hover:bg-[var(--control-bg-hover)]"
                    onMouseEnter={() =>
                      setDiagramTypePickerStatusText(
                        set.tooltip ?? set.description ?? set.types.map((t) => DIAGRAM_TYPE_LABELS[t] ?? t).join(' / ')
                      )
                    }
                    onMouseLeave={() => setDiagramTypePickerStatusText('')}
                  >
                    <span className="font-medium">{set.label}</span>
                    <span className="inline-flex items-center gap-1 text-[var(--control-muted-text)]">
                      {set.types.map((type) => (
                        <span
                          key={type}
                          className="inline-flex items-center justify-center w-5 h-5 rounded border border-[var(--panel-border)] bg-[var(--control-bg)]"
                          aria-label={DIAGRAM_TYPE_LABELS[type] ?? type}
                        >
                          {getDiagramTypeIcon(type)}
                        </span>
                      ))}
                    </span>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {allSets.map((set) => (
                  <Button
                    key={set.id}
                    type="button"
                    onClick={() => applyDiagramTypeSet(set.types)}
                    className="relative group w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] text-[var(--control-text)] hover:bg-[var(--control-bg-hover)]"
                    onMouseEnter={() =>
                      setDiagramTypePickerStatusText(
                        set.tooltip ?? set.description ?? set.types.map((t) => DIAGRAM_TYPE_LABELS[t] ?? t).join(' / ')
                      )
                    }
                    onMouseLeave={() => setDiagramTypePickerStatusText('')}
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{set.label}</span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {set.description ?? ''}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[var(--control-muted-text)] shrink-0">
                      {set.types.map((type) => (
                        <span
                          key={type}
                          className="inline-flex items-center justify-center w-5 h-5 rounded border border-[var(--panel-border)] bg-[var(--control-bg)]"
                          aria-label={DIAGRAM_TYPE_LABELS[type] ?? type}
                        >
                          {getDiagramTypeIcon(type)}
                        </span>
                      ))}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="my-2 border-t border-[var(--panel-border)]" />
          <div className="grid grid-cols-6 gap-1.5">
            {DIAGRAM_TYPES.map((type) => {
              const isSelected = currentDiagramTypeSelection.includes(type);
              const label = getDiagramTypeShortLabel(type);
              const fullLabel = DIAGRAM_TYPE_LABELS[type] ?? type;
              return (
                <Button
                  key={type}
                  type="button"
                  onClick={() => toggleDiagramTypeInPicker(type)}
                  onMouseEnter={() => setDiagramTypePickerStatusText(`${type} — ${fullLabel}`)}
                  onMouseLeave={() => setDiagramTypePickerStatusText('')}
                  className={`relative group rounded px-2 py-1 text-[11px] font-mono tabular-nums transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                      : CONTROL_BASE
                  }`}
                >
                  <span className="flex items-center justify-center gap-1">
                    <span className="text-slate-500 dark:text-slate-400">{getDiagramTypeIcon(type)}</span>
                    <span>{label}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="ml-auto flex items-center justify-end gap-2 relative min-h-7 h-7" ref={onRootRef}>
      <span>Diagram type</span>
      {renderDiagramTypeSelectorControl()}
      {renderDiagramTypePicker()}
    </div>
  );
};

export default DiagramTypePicker;
