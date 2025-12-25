import React, { useEffect, useState } from 'react';
import { Check, Folder, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { HistorySession } from '../services/history/types';

type ChatProjectsProps = {
  projects: HistorySession[];
  activeProjectId: string | null;
  onNewProject: () => void;
  onOpenProject: (sessionId: string) => void | Promise<void>;
  onRenameProject: (sessionId: string, title: string) => void | Promise<void>;
  onDeleteProject: (sessionId: string) => void | Promise<void>;
  onUndoDeleteProject: (sessionId: string) => void;
  deleteUndoMs: number;
};

const formatProjectTimestamp = (ts?: number) => {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
};

const ChatProjects: React.FC<ChatProjectsProps> = ({
  projects,
  activeProjectId,
  onNewProject,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onUndoDeleteProject,
  deleteUndoMs,
}) => {
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectTitle, setEditingProjectTitle] = useState('');
  const [undoProjectId, setUndoProjectId] = useState<string | null>(null);
  const [undoProjectTitle, setUndoProjectTitle] = useState<string>('');
  const undoTimerRef = React.useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Folder size={14} /> Projects
        </div>
        <button
          onClick={onNewProject}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
          type="button"
        >
          <Plus size={12} /> New
        </button>
      </div>
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
      <div className="px-2 pb-2 max-h-44 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-slate-400 dark:text-slate-500">
            No projects yet.
          </div>
        ) : (
          <div className="space-y-1">
            {projects.map((project) => {
              const isActive = project.id === activeProjectId;
              const isEditing = project.id === editingProjectId;
              return (
                <div key={project.id} className="px-2 py-2 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
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
                          onClick={() => onOpenProject(project.id)}
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
                              onClick={() => onOpenProject(project.id)}
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
    </div>
  );
};

export default ChatProjects;
