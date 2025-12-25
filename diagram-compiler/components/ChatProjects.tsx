import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { DiagramType } from '../types';
import type { HistorySession } from '../services/history/types';
import { DIAGRAM_TYPE_LABELS } from '../utils/diagramTypeMeta';

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
  detectedDiagramType: DiagramType | null;
  isMarkdownNotebook: boolean;
  isCodeEmpty: boolean;
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
  detectedDiagramType,
  isMarkdownNotebook,
  isCodeEmpty,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [sortKey, setSortKey] = useState<'updated' | 'created' | 'name'>('updated');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectTitle, setEditingProjectTitle] = useState('');
  const [undoProjectId, setUndoProjectId] = useState<string | null>(null);
  const [undoProjectTitle, setUndoProjectTitle] = useState<string>('');
  const undoTimerRef = React.useRef<number | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const detectedLabel = detectedDiagramType ? DIAGRAM_TYPE_LABELS[detectedDiagramType] ?? detectedDiagramType : null;
  const selectedLabel = DIAGRAM_TYPE_LABELS[diagramType] ?? diagramType;
  const isDetectedMatch = !!detectedDiagramType && detectedDiagramType === diagramType;

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
              onClick={() => activeProjectId && onDeleteProject(activeProjectId)}
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
              <div className="flex items-center gap-2">
                <span>Diagram type</span>
                {isCodeEmpty && !isMarkdownNotebook && (
                  <select
                    value={diagramType}
                    onChange={(e) => onDiagramTypeChange(e.target.value as DiagramType)}
                    className="w-40 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                  >
              <option value="architecture">Architecture</option>
              <option value="block">Block</option>
              <option value="c4">C4 (experimental)</option>
              <option value="class">Class Diagram</option>
              <option value="er">Entity Relationship</option>
              <option value="sequence">Sequence Diagram</option>
              <option value="flowchart">Flowchart</option>
              <option value="gantt">Gantt</option>
              <option value="gitGraph">Git Graph</option>
              <option value="kanban">Kanban</option>
              <option value="mindmap">Mindmap</option>
              <option value="packet">Packet</option>
              <option value="pie">Pie</option>
              <option value="quadrantChart">Quadrant Chart</option>
              <option value="radar">Radar</option>
              <option value="requirementDiagram">Requirement Diagram</option>
              <option value="sankey">Sankey</option>
              <option value="state">State Diagram</option>
              <option value="timeline">Timeline</option>
              <option value="treemap">Treemap</option>
              <option value="userJourney">User Journey</option>
              <option value="xychart">XY Chart</option>
              <option value="zenuml">ZenUML</option>
                  </select>
                )}
              </div>
              {isMarkdownNotebook ? (
                <span className="w-40 mt-1 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 inline-flex items-center">
                  Markdown
                </span>
              ) : !isCodeEmpty ? (
                <span className="w-40 mt-1 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 inline-flex items-center">
                  {selectedLabel}
                </span>
              ) : null}
            </div>
            {!isMarkdownNotebook && detectedLabel && (
              <span className={`block text-[10px] ${isDetectedMatch ? 'text-emerald-500' : 'text-amber-500'}`}>
                {detectedLabel}
                {!isDetectedMatch ? ` (выбрано: ${selectedLabel})` : ''}
              </span>
            )}
          </div>
        )}
      </div>
      {!isExpanded && activeProject && (
        <div className="mx-3 mb-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{activeProject.title}</div>
            <div className="flex flex-col text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span>Diagram type</span>
                  {isCodeEmpty && !isMarkdownNotebook && (
                    <select
                      value={diagramType}
                      onChange={(e) => onDiagramTypeChange(e.target.value as DiagramType)}
                      className="w-40 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300"
                    >
                <option value="architecture">Architecture</option>
                <option value="block">Block</option>
                <option value="c4">C4 (experimental)</option>
                <option value="class">Class Diagram</option>
                <option value="er">Entity Relationship</option>
                <option value="sequence">Sequence Diagram</option>
                <option value="flowchart">Flowchart</option>
                <option value="gantt">Gantt</option>
                <option value="gitGraph">Git Graph</option>
                <option value="kanban">Kanban</option>
                <option value="mindmap">Mindmap</option>
                <option value="packet">Packet</option>
                <option value="pie">Pie</option>
                <option value="quadrantChart">Quadrant Chart</option>
                <option value="radar">Radar</option>
                <option value="requirementDiagram">Requirement Diagram</option>
                <option value="sankey">Sankey</option>
                <option value="state">State Diagram</option>
                <option value="timeline">Timeline</option>
                <option value="treemap">Treemap</option>
                <option value="userJourney">User Journey</option>
                <option value="xychart">XY Chart</option>
                <option value="zenuml">ZenUML</option>
                    </select>
                  )}
                </div>
                {isMarkdownNotebook ? (
                  <span className="w-40 mt-1 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 inline-flex items-center">
                    Markdown
                  </span>
                ) : !isCodeEmpty ? (
                  <span className="w-40 mt-1 px-2 py-1 text-[11px] border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 inline-flex items-center">
                    {selectedLabel}
                  </span>
                ) : null}
              </div>
              {!isMarkdownNotebook && detectedLabel && (
                <span className={`block text-[10px] ${isDetectedMatch ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {detectedLabel}
                  {!isDetectedMatch ? ` (выбрано: ${selectedLabel})` : ''}
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
                              className="w-full text-xs px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                              autoFocus
                            />
                      ) : (
                            <button
                              type="button"
                              onClick={() => void handleOpenProject(project.id)}
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
                            <>
                              <button
                                type="button"
                                onClick={() => void commitProjectRename(project)}
                                className="p-1 rounded text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                                title="Save name"
                              >
                                <Check size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingProject}
                                className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Cancel"
                              >
                                <X size={12} />
                              </button>
                            </>
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
                                onClick={() => startEditingProject(project)}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Rename"
                              >
                                <Pencil size={12} />
                              </button>
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
