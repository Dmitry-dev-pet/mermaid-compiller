import React, { useMemo } from 'react';
import { Trash2, X } from 'lucide-react';
import type { HistorySession } from '../../services/history/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

type SortKey = 'updated' | 'created' | 'name';

type ProjectsMenuProps = {
  menuRef?: React.Ref<HTMLDivElement>;
  projects: HistorySession[];
  activeProjectId: string | null;
  editingProjectId: string | null;
  editingProjectTitle: string;
  sortKey: SortKey;
  onSortChange: (value: SortKey) => void;
  onPreviewProjectSnapshot: (sessionId: string) => Promise<void>;
  onClearProjectPreview: () => void;
  onStartEditingProject: (project: HistorySession) => void;
  onEditingProjectTitleChange: (value: string) => void;
  onCommitProjectRename: (project: HistorySession) => void | Promise<void>;
  onCancelEditingProject: () => void;
  onOpenProject: (sessionId: string) => void | Promise<void>;
  onDeleteProject: (project: HistorySession) => void | Promise<void>;
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

const ProjectsMenu: React.FC<ProjectsMenuProps> = ({
  menuRef,
  projects,
  activeProjectId,
  editingProjectId,
  editingProjectTitle,
  sortKey,
  onSortChange,
  onPreviewProjectSnapshot,
  onClearProjectPreview,
  onStartEditingProject,
  onEditingProjectTitleChange,
  onCommitProjectRename,
  onCancelEditingProject,
  onOpenProject,
  onDeleteProject,
}) => {
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

  return (
    <div
      ref={menuRef}
      className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border shadow-lg bg-transparent"
      style={{ borderColor: 'var(--panel-border, #e5e7eb)', backgroundColor: 'var(--menu-bg, var(--panel-bg, #f3f4f6))' }}
    >
      <div className="px-3 py-2 flex items-center justify-between gap-3">
        <label className="text-[10px] text-slate-400 dark:text-slate-500">Sort</label>
        <Select
          value={sortKey}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
          size="xs"
          className="ml-2"
        >
          <option value="updated">Updated (newest)</option>
          <option value="created">Created (newest)</option>
          <option value="name">Name (A-Z)</option>
        </Select>
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
                        <Input
                          value={editingProjectTitle}
                          onChange={(e) => onEditingProjectTitleChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void onCommitProjectRename(project);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              onCancelEditingProject();
                            }
                          }}
                          onBlur={() => void onCommitProjectRename(project)}
                          size="sm"
                          autoFocus
                        />
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => onStartEditingProject(project)}
                          className="h-auto px-0 py-0 text-xs font-medium text-slate-700 dark:text-slate-200 truncate hover:text-blue-600 dark:hover:text-blue-400"
                          title={project.title}
                        >
                          {project.title}
                        </Button>
                      )}
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        Updated: {formatProjectTimestamp(project.updatedAt ?? project.createdAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onMouseDown={(e) => {
                            e.preventDefault();
                          }}
                          onClick={onCancelEditingProject}
                          className="h-6 w-6 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Cancel"
                        >
                          <X size={12} />
                        </Button>
                      ) : (
                        <>
                          {isActive ? (
                            <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                              Active
                            </span>
                          ) : (
                            <Button
                              type="button"
                              onClick={() => void onOpenProject(project.id)}
                              className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                            >
                              Continue
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => void onDeleteProject(project)}
                            className="h-6 w-6 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </Button>
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

export default ProjectsMenu;
