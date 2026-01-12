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
  notebookBuildCount: number | null;
  onNotebookBuildCountChange: (count: number | null) => void;
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
  detectedDiagramType,
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
  const undoTimerRef = React.useRef<number | null>(null);
  const diagramTypePickerRootRef = useRef<HTMLDivElement | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const detectedLabel = detectedDiagramType ? DIAGRAM_TYPE_LABELS[detectedDiagramType] ?? detectedDiagramType : null;
  const mainTypeList = (mainDiagramTypes?.length ? mainDiagramTypes : [...MAIN_DIAGRAM_TYPES])
    .filter((t) => t !== 'auto');
  const selectedLabel = diagramType === 'auto'
    ? `Main (${mainTypeList.map((t) => getDiagramTypeShortLabel(t)).join('/')})`
    : (DIAGRAM_TYPE_LABELS[diagramType] ?? diagramType);
  const isDetectedMatch = !!detectedDiagramType && detectedDiagramType === diagramType;

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

  const renderDiagramTypeSelectionBadge = () => {
    const types = diagramType === 'auto' ? mainTypeList : [diagramType];
    const title =
      diagramType === 'auto'
        ? `Main (${types.join(', ')})`
        : (DIAGRAM_TYPE_LABELS[diagramType] ?? diagramType);
    return (
      <span className="inline-flex items-center gap-1" title={title}>
        {types.map((type) => (
          <span
            key={type}
            className="inline-flex items-center justify-center w-5 h-5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400"
            aria-label={DIAGRAM_TYPE_LABELS[type] ?? type}
          >
            {getDiagramTypeIcon(type)}
          </span>
        ))}
      </span>
    );
  };

  const renderDiagramTypePicker = (placement: 'expanded' | 'active') => {
    if (!isDiagramTypePickerOpen || diagramTypePickerPlacement !== placement) return null;
    return (
      <div className="absolute left-0 top-full z-50 mt-1 w-[min(22rem,90vw)] rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-lg">
        <div className="px-2 py-2">
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
                  className={`relative group rounded border px-2 py-1 text-[11px] font-mono tabular-nums transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900/40'
                  }`}
                  title={
                    DIAGRAM_TYPE_LABELS[type]
                      ? `${type} — ${DIAGRAM_TYPE_LABELS[type]}`
                      : type
                  }
                >
                  <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 text-white text-[10px] px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {fullLabel}
                  </span>
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
    };
    window.document.addEventListener('mousedown', onPointerDown, true);
    window.document.addEventListener('touchstart', onPointerDown, true);
    return () => {
      window.document.removeEventListener('mousedown', onPointerDown, true);
      window.document.removeEventListener('touchstart', onPointerDown, true);
    };
  }, [isDiagramTypePickerOpen]);

  const registerDiagramTypePickerRoot = (placement: 'expanded' | 'active') => (node: HTMLDivElement | null) => {
    if (diagramTypePickerPlacement !== placement) return;
    diagramTypePickerRootRef.current = node;
  };

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            title={isExpanded ? 'Collapse projects' : 'Expand projects'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="flex items-center gap-2">
              <Folder size={14} /> Projects
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">({projects.length})</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleCreateProject}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
              type="button"
            >
              <Plus size={12} /> New
            </button>
            <button
              onClick={() => activeProject && handleDelete(activeProject)}
              disabled={!activeProjectId}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
              type="button"
              title="Delete current project"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="flex flex-col text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 relative" ref={registerDiagramTypePickerRoot('expanded')}>
                  <span>Diagram type</span>
                  <button
                    type="button"
                    onClick={() => openDiagramTypePicker('expanded')}
                    className="w-40 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <span className="flex items-center justify-between gap-2">
                      {renderDiagramTypeSelectionBadge()}
                      <ChevronDown size={12} className="opacity-60" />
                    </span>
                  </button>
                  {renderDiagramTypePicker('expanded')}
                </div>
              <div className="flex items-center gap-2 mt-1">
                <span>Count</span>
                <input
                  type="number"
                  min={1}
                  value={notebookBuildCount ?? ''}
                  placeholder="auto"
                  className="w-20 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                  onChange={(e) => {
                    const next = e.target.value.trim();
                    if (!next) {
                      onNotebookBuildCountChange(null);
                      return;
                    }
                    const parsed = Number(next);
                    if (Number.isNaN(parsed) || parsed <= 0) {
                      onNotebookBuildCountChange(null);
                      return;
                    }
                    onNotebookBuildCountChange(Math.floor(parsed));
                  }}
                />
              </div>
            </div>
            {diagramType === 'auto' && (
              <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                Main ограничен: {mainTypeList.map((t) => getDiagramTypeShortLabel(t)).join(' / ')}
              </span>
            )}
            {detectedLabel && diagramType === 'auto' && (
              <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                Detected: {detectedLabel}
              </span>
            )}
            {detectedLabel && diagramType !== 'auto' && !isDetectedMatch && (
              <span className="block text-[10px] text-amber-500">
                {detectedLabel} (selected: {selectedLabel})
              </span>
            )}
          </div>
        )}
      </div>
      {!isExpanded && activeProject && (
        <div className="mx-3 mb-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              {editingProjectId === activeProject.id ? (
                <>
                  <input
                    value={editingProjectTitle}
                    onChange={(e) => setEditingProjectTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitProjectRename(activeProject);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEditingProject();
                      }
                    }}
                    onBlur={() => void commitProjectRename(activeProject)}
                    className="w-44 text-xs px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                    autoFocus
                  />
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
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => startEditingProject(activeProject)}
                    className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate hover:text-blue-600 dark:hover:text-blue-400"
                    title="Rename project"
                  >
                    {activeProject.title ?? 'Project'}
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-col text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-col">
                <div className="flex items-center gap-2 relative" ref={registerDiagramTypePickerRoot('active')}>
                  <span>Diagram type</span>
                  <button
                    type="button"
                    onClick={() => openDiagramTypePicker('active')}
                    className="w-40 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <span className="flex items-center justify-between gap-2">
                      {renderDiagramTypeSelectionBadge()}
                      <ChevronDown size={12} className="opacity-60" />
                    </span>
                  </button>
                  {renderDiagramTypePicker('active')}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span>Count</span>
                <input
                  type="number"
                  min={1}
                  value={notebookBuildCount ?? ''}
                  placeholder="auto"
                  className="w-20 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                  onChange={(e) => {
                    const next = e.target.value.trim();
                    if (!next) {
                      onNotebookBuildCountChange(null);
                        return;
                      }
                      const parsed = Number(next);
                      if (Number.isNaN(parsed) || parsed <= 0) {
                        onNotebookBuildCountChange(null);
                        return;
                      }
                      onNotebookBuildCountChange(Math.floor(parsed));
                    }}
                  />
                </div>
              </div>
              {diagramType === 'auto' && (
                <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                  Main: {mainTypeList.map((t) => getDiagramTypeShortLabel(t)).join(' / ')}
                </span>
              )}
              {detectedLabel && diagramType === 'auto' && (
                <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                  Detected: {detectedLabel}
                </span>
              )}
              {detectedLabel && diagramType !== 'auto' && !isDetectedMatch && (
                <span className="block text-[10px] text-amber-500">
                  {detectedLabel} (selected: {selectedLabel})
                </span>
              )}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
            Updated: {formatProjectTimestamp(activeProject.updatedAt ?? activeProject.createdAt)}
          </div>
        </div>
      )}
      {undoProjectId && (
        <div className="mx-3 mb-2 px-2 py-1.5 rounded border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 text-[11px] text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
          <span className="truncate">Удалено: {undoProjectTitle}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="text-[11px] font-semibold text-amber-700 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100"
          >
            Undo
          </button>
        </div>
      )}
      {isExpanded && (
        <>
          <div className="px-3 pb-2">
            <label className="text-[10px] text-slate-400 dark:text-slate-500">Sort</label>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as typeof sortKey)}
              className="ml-2 text-[10px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
            >
              <option value="updated">Updated (newest)</option>
              <option value="created">Created (newest)</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
          <div className="px-2 pb-2 max-h-[50vh] overflow-y-auto">
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
                      className="px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40"
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
                              className="w-full text-xs px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
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
        </>
      )}
    </div>
  );
};

export default ChatProjects;
