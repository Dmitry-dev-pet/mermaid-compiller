import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Boxes,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code,
  Columns3,
  Database,
  Folder,
  GitBranch,
  GitCommit,
  Grid2X2,
  LayoutGrid,
  Layers,
  LineChart,
  Package,
  PieChart,
  Plus,
  Route,
  Share2,
  Shuffle,
  Target,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import type { DiagramType } from '../types';
import type { HistorySession } from '../services/history/types';
import { DIAGRAM_TYPE_LABELS, getDiagramTypeShortLabel } from '../utils/diagramTypeMeta';
import { DIAGRAM_TYPES, MAIN_DIAGRAM_TYPES } from '../utils/diagramTypes';
import { CONTROL_BASE, HEADER_CONTROL_BUTTON, HEADER_CONTROL_SELECT } from '../utils/uiControlStyles';

type ChatProjectsProps = {
  projects: HistorySession[];
  activeProjectId: string | null;
  onNewProject: () => void;
  onOpenProject: (sessionId: string) => void | Promise<void>;
  onRenameProject: (sessionId: string, title: string) => void | Promise<void>;
  onDeleteProject: (sessionId: string) => void | Promise<void>;
  onUndoDeleteProject: (sessionId: string) => void;
  onPreviewProjectSnapshot: (sessionId: string) => Promise<void>;
  onClearProjectPreview: () => void;
  deleteUndoMs: number;
  diagramType: DiagramType;
  onDiagramTypeChange: (type: DiagramType) => void;
  mainDiagramTypes: DiagramType[];
  onMainDiagramTypesChange: (types: DiagramType[]) => void;
  detectedDiagramType: DiagramType | null;
  notebookBuildCount: number | string | null;
  onNotebookBuildCountChange: (count: number | string | null) => void;
};

const formatProjectTimestamp = (ts?: number) => {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ChatProjects: React.FC<ChatProjectsProps> = ({
  projects,
  activeProjectId,
  onNewProject,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onUndoDeleteProject,
  onPreviewProjectSnapshot,
  onClearProjectPreview,
  deleteUndoMs,
  diagramType,
  onDiagramTypeChange,
  mainDiagramTypes,
  onMainDiagramTypesChange,
  notebookBuildCount,
  onNotebookBuildCountChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<'updated' | 'created' | 'name'>('updated');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectTitle, setEditingProjectTitle] = useState('');
  const [undoProjectId, setUndoProjectId] = useState<string | null>(null);
  const [undoProjectTitle, setUndoProjectTitle] = useState('');
  const [isDiagramTypePickerOpen, setIsDiagramTypePickerOpen] = useState(false);
  const [diagramTypePickerPlacement, setDiagramTypePickerPlacement] = useState<'expanded' | 'active'>('expanded');
  const [isMoreDiagramTypeSetsOpen, setIsMoreDiagramTypeSetsOpen] = useState(false);
  const [diagramTypePickerStatusText, setDiagramTypePickerStatusText] = useState('');
  const undoTimerRef = React.useRef<number | null>(null);
  const projectsMenuRef = useRef<HTMLDivElement | null>(null);
  const projectsMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const diagramTypePickerRootRef = useRef<HTMLDivElement | null>(null);
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

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const mainTypeList = (mainDiagramTypes?.length ? mainDiagramTypes : [...MAIN_DIAGRAM_TYPES])
    .filter((t) => t !== 'auto');
  const isSingleMode = diagramType !== 'auto';
  const selectedNotebookCountValue = notebookBuildCount === null
    ? 'auto'
    : typeof notebookBuildCount === 'number'
      ? String(notebookBuildCount)
      : notebookBuildCount;

  const currentDiagramTypeSelection = useMemo(() => {
    const base =
      diagramType === 'auto'
        ? [...mainTypeList]
        : [diagramType];
    const sanitized = base.filter((t) => t !== 'auto');
    return sanitized.length ? sanitized : [...MAIN_DIAGRAM_TYPES];
  }, [diagramType, mainTypeList]);

  const openDiagramTypePicker = (placement: 'expanded' | 'active') => {
    setDiagramTypePickerPlacement(placement);
    setIsDiagramTypePickerOpen((prev) => (placement === diagramTypePickerPlacement ? !prev : true));
    setIsMoreDiagramTypeSetsOpen(false);
    setDiagramTypePickerStatusText('');
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

  const renderDiagramTypeSelectorControl = (placement: 'expanded' | 'active') => {
    const selectedTypes = diagramType === 'auto' ? mainTypeList : [diagramType];
    const overflowCount = Math.max(0, selectedTypes.length - 4);
    const visibleTypes = selectedTypes.slice(0, 4);
    const title =
      diagramType === 'auto'
        ? `Main (${selectedTypes.join(', ')})`
        : (DIAGRAM_TYPE_LABELS[diagramType] ?? diagramType);

    return (
      <div
        className={`${HEADER_CONTROL_BUTTON} w-40 justify-between gap-2`}
        title={title}
      >
        <div className="flex items-center gap-1 min-w-0">
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
        <button
          type="button"
          onClick={() => openDiagramTypePicker(placement)}
          className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400"
          aria-label="Open diagram type picker"
        >
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </div>
    );
  };

  const renderDiagramTypePicker = (placement: 'expanded' | 'active') => {
    if (!isDiagramTypePickerOpen || diagramTypePickerPlacement !== placement) return null;
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
              <button
                type="button"
                onClick={() => setIsMoreDiagramTypeSetsOpen((prev) => !prev)}
                aria-pressed={isMoreDiagramTypeSetsOpen}
                className={`inline-flex items-center gap-1 text-[10px] ${
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
              </button>
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
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => applyDiagramTypeSet(set.types)}
                    className="relative group inline-flex items-center gap-1.5 rounded border border-[var(--panel-border)] bg-[var(--control-bg)] px-2 py-1 text-[11px] text-[var(--control-text)] hover:bg-[var(--control-bg-hover)]"
                    onMouseEnter={() =>
                      setDiagramTypePickerStatusText(
                        set.tooltip ?? set.description ?? set.types.map((t) => DIAGRAM_TYPE_LABELS[t] ?? t).join(' / ')
                      )}
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
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                {allSets.map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => applyDiagramTypeSet(set.types)}
                    className="relative group w-full flex items-center justify-between gap-2 rounded border border-[var(--panel-border)] bg-[var(--control-bg)] px-2 py-1.5 text-left text-[11px] text-[var(--control-text)] hover:bg-[var(--control-bg-hover)]"
                    onMouseEnter={() =>
                      setDiagramTypePickerStatusText(
                        set.tooltip ?? set.description ?? set.types.map((t) => DIAGRAM_TYPE_LABELS[t] ?? t).join(' / ')
                      )}
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
                  </button>
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
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleDiagramTypeInPicker(type)}
                  onMouseEnter={() => setDiagramTypePickerStatusText(`${type} — ${fullLabel}`)}
                  onMouseLeave={() => setDiagramTypePickerStatusText('')}
                  className={`relative group rounded border px-2 py-1 text-[11px] font-mono tabular-nums transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                      : CONTROL_BASE
                  }`}
                >
                  <span className="flex items-center justify-center gap-1">
                    <span className="text-slate-500 dark:text-slate-400">{getDiagramTypeIcon(type)}</span>
                    <span>{label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const sortedProjects = useMemo(() => {
    const next = [...projects];
    if (sortKey === 'name') {
      next.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' }));
      return next;
    }
    if (sortKey === 'created') {
      next.sort((a, b) => b.createdAt - a.createdAt);
      return next;
    }
    next.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    return next;
  }, [projects, sortKey]);

  const startEditingProject = (project: HistorySession) => {
    setEditingProjectId(project.id);
    setEditingProjectTitle(project.title ?? '');
  };

  const cancelEditingProject = () => {
    setEditingProjectId(null);
    setEditingProjectTitle('');
  };

  const commitProjectRename = async (project: HistorySession) => {
    const nextTitle = editingProjectTitle.trim();
    if (nextTitle && nextTitle !== project.title) {
      await onRenameProject(project.id, nextTitle);
    }
    cancelEditingProject();
  };

  const clearUndo = () => {
    setUndoProjectId(null);
    setUndoProjectTitle('');
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const handleDelete = async (project: HistorySession) => {
    await onDeleteProject(project.id);
    setUndoProjectId(project.id);
    setUndoProjectTitle(project.title ?? 'Project');
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = window.setTimeout(() => {
      clearUndo();
    }, deleteUndoMs);
  };

  const handleUndo = () => {
    if (!undoProjectId) return;
    onUndoDeleteProject(undoProjectId);
    clearUndo();
  };

  const handleOpenProject = async (projectId: string) => {
    await onOpenProject(projectId);
    setIsExpanded(false);
    onClearProjectPreview();
  };

  const handleCreateProject = () => {
    onNewProject();
    setIsExpanded(false);
    onClearProjectPreview();
  };

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDiagramTypePickerOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (diagramTypePickerRootRef.current?.contains(target)) return;
      setIsDiagramTypePickerOpen(false);
      setIsMoreDiagramTypeSetsOpen(false);
      setDiagramTypePickerStatusText('');
    };
    window.document.addEventListener('mousedown', onPointerDown, true);
    window.document.addEventListener('touchstart', onPointerDown, true);
    return () => {
      window.document.removeEventListener('mousedown', onPointerDown, true);
      window.document.removeEventListener('touchstart', onPointerDown, true);
    };
  }, [isDiagramTypePickerOpen]);

  useEffect(() => {
    if (!isExpanded) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (projectsMenuRef.current?.contains(target)) return;
      if (projectsMenuButtonRef.current?.contains(target)) return;
      if (diagramTypePickerRootRef.current?.contains(target)) return;
      setIsExpanded(false);
      cancelEditingProject();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsExpanded(false);
      cancelEditingProject();
    };

    window.document.addEventListener('mousedown', onPointerDown, true);
    window.document.addEventListener('touchstart', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.document.removeEventListener('mousedown', onPointerDown, true);
      window.document.removeEventListener('touchstart', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isExpanded]);

  const registerDiagramTypePickerRoot = (placement: 'expanded' | 'active') => (node: HTMLDivElement | null) => {
    if (diagramTypePickerPlacement !== placement) return;
    diagramTypePickerRootRef.current = node;
  };

  return (
    <div
      className="relative h-24 px-4 py-2 border-b bg-transparent flex flex-col gap-2"
      style={{ borderColor: 'var(--panel-border, #e5e7eb)', backgroundColor: 'var(--panel-alt-bg, #ffffff)' }}
    >
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            ref={projectsMenuButtonRef}
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`${HEADER_CONTROL_BUTTON} flex items-center gap-2 min-w-0`}
            title={isExpanded ? 'Close projects' : 'Open projects'}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="flex items-center gap-2 shrink-0">
              <Folder size={14} /> Projects
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">({projects.length})</span>
          </button>

          {activeProject && (
            <span className="min-w-0 truncate text-[11px] text-[var(--control-muted-text)]" title={activeProject.title}>
              {activeProject.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {undoProjectId && (
            <button
              type="button"
              onClick={handleUndo}
              className={`${HEADER_CONTROL_BUTTON} border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30`}
              title={`Undo delete: ${undoProjectTitle}`}
            >
              Undo
            </button>
          )}
          <button
            onClick={handleCreateProject}
            className={HEADER_CONTROL_BUTTON}
            type="button"
          >
            <Plus size={12} /> New
          </button>
          <button
            onClick={() => activeProject && handleDelete(activeProject)}
            disabled={!activeProjectId}
            className={`${HEADER_CONTROL_BUTTON} text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40`}
            type="button"
            title="Delete current project"
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        {!isSingleMode && (
          <div className="flex items-center gap-2">
            <span>Count</span>
            <select
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
              className={`${HEADER_CONTROL_SELECT} w-24`}
            >
              {NOTEBOOK_COUNT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2 relative" ref={registerDiagramTypePickerRoot('active')}>
          <span>Diagram type</span>
          {renderDiagramTypeSelectorControl('active')}
          {renderDiagramTypePicker('active')}
        </div>
      </div>

      {isExpanded && (
        <div
          ref={projectsMenuRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border shadow-lg bg-transparent"
          style={{ borderColor: 'var(--panel-border, #e5e7eb)', backgroundColor: 'var(--menu-bg, var(--panel-bg, #f3f4f6))' }}
        >
          <div className="px-3 py-2 flex items-center justify-between gap-3">
            <label className="text-[10px] text-slate-400 dark:text-slate-500">Sort</label>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
              className={`${HEADER_CONTROL_SELECT} ml-2 h-7 text-[10px] px-2 py-1`}
            >
              <option value="updated">Updated (newest)</option>
              <option value="created">Created (newest)</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
          <div className="px-2 pb-2 max-h-[60vh] overflow-y-auto">
            {sortedProjects.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-slate-400 dark:text-slate-500">
                No projects yet.
              </div>
            ) : (
              <div className="space-y-1">
                {sortedProjects.map((project) => {
                  const isActive = project.id === activeProjectId;
                  const isEditing = project.id === editingProjectId;
                  return (
                    <div
                      key={project.id}
                      className="px-2 py-1.5 rounded-md border border-[var(--panel-border)] bg-[var(--control-bg)] hover:bg-[var(--control-bg-hover)] transition-colors"
                      onMouseEnter={() => {
                        void onPreviewProjectSnapshot(project.id);
                      }}
                      onMouseLeave={() => {
                        onClearProjectPreview();
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <input
                              value={editingProjectTitle}
                              onChange={(e) => setEditingProjectTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void commitProjectRename(project);
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelEditingProject();
                                }
                              }}
                              onBlur={() => void commitProjectRename(project)}
                              className="w-full text-xs px-2 py-1 rounded border border-[var(--panel-border)] bg-[var(--control-bg)] text-[var(--control-text)] focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditingProject(project)}
                              className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate hover:text-blue-600 dark:hover:text-blue-400"
                              title={project.title}
                            >
                              {project.title}
                            </button>
                          )}
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                            Updated: {formatProjectTimestamp(project.updatedAt ?? project.createdAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {isEditing ? (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                              }}
                              onClick={cancelEditingProject}
                              className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          ) : (
                            <>
                              {isActive ? (
                                <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                  Active
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void handleOpenProject(project.id)}
                                  className="text-[10px] px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                                >
                                  Continue
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleDelete(project)}
                                className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatProjects;
