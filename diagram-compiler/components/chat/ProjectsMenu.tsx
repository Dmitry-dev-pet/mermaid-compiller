import React, { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Chrome,
  Cloud,
  Download,
  Github,
  LogOut,
  RefreshCw,
  Trash2,
  UploadCloud,
  User as UserIcon,
  X,
} from 'lucide-react';
import type { HistorySession } from '../../services/history/types';
import type { StorageMode } from '../../hooks/core/useStorageMode';
import type { CloudSyncStatus } from '../../hooks/studio/useCloudSync';
import type { CloudProjectsStatus } from '../../hooks/studio/useCloudProjects';
import type { CloudMigrationItem, CloudMigrationStatus } from '../../hooks/studio/useCloudMigration';
import type { ProjectMeta } from '../../services/storage';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useAuth } from '../../contexts/AuthContext';

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
  onExportProject: (sessionId: string) => Promise<void>;
  onImportProject: (file: File) => Promise<void>;
  byoConfig: { url: string; anonKey: string };
  onByoConfigChange: (updates: { url?: string; anonKey?: string }) => void;
  onTestByoConfig: () => Promise<{ ok: boolean; error?: string }>;
  storageMode?: StorageMode;
  onStorageModeChange?: (mode: StorageMode) => void;
  cloudSync?: { status: CloudSyncStatus; syncActive: () => Promise<void>; syncAll: () => Promise<void> };
  cloudProjects?: {
    status: CloudProjectsStatus;
    projects: ProjectMeta[];
    refresh: () => Promise<void>;
    importFromCloud: (projectId: string) => Promise<void>;
  };
  cloudMigration?: {
    status: CloudMigrationStatus;
    items: CloudMigrationItem[];
    unlinkedCount: number;
    migrateAll: () => Promise<void>;
    migrateActive: () => Promise<void>;
    cancel: () => void;
    reset: () => void;
  };
};

const SectionToggle: React.FC<{
  expanded: boolean;
  onToggle: () => void;
  title?: string;
}> = ({ expanded, onToggle, title }) => {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      className="h-6 w-6 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
      title={title ?? (expanded ? 'Collapse' : 'Expand')}
    >
      <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </Button>
  );
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
  onExportProject,
  onImportProject,
  byoConfig,
  onByoConfigChange,
  onTestByoConfig,
  storageMode,
  onStorageModeChange,
  cloudSync,
  cloudProjects,
  cloudMigration,
}) => {
  const auth = useAuth();
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudAuthError, setCloudAuthError] = useState<string | null>(null);
  const [cloudProjectsExpanded, setCloudProjectsExpanded] = useState(false);
  const [cloudMigrationExpanded, setCloudMigrationExpanded] = useState(false);
  const [byoExpanded, setByoExpanded] = useState(false);
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ kind: 'idle' | 'error' | 'success'; message?: string }>({
    kind: 'idle',
  });
  const [byoStatus, setByoStatus] = useState<{ kind: 'idle' | 'error' | 'success'; message?: string }>({
    kind: 'idle',
  });

  const cloudLabel = useMemo(() => {
    if (auth.status === 'disabled') return 'disabled';
    if (auth.status === 'loading') return 'loading…';
    if (auth.status === 'error') return auth.error ?? 'error';
    if (auth.status === 'signed_in') {
      const email = auth.user?.email;
      const login = typeof auth.user?.user_metadata?.login === 'string' ? auth.user.user_metadata.login : null;
      return email || login || 'signed in';
    }
    return 'signed out';
  }, [auth.error, auth.status, auth.user]);

  const canSync =
    !!cloudSync &&
    (storageMode === 'cloud_hosted' || storageMode === 'cloud_byo') &&
    auth.status === 'signed_in' &&
    cloudSync.status.kind !== 'syncing';

  const canBrowseCloudProjects =
    !!cloudProjects &&
    (storageMode === 'cloud_hosted' || storageMode === 'cloud_byo') &&
    auth.status === 'signed_in' &&
    cloudProjects.status.kind !== 'loading';

  const canMigrate =
    !!cloudMigration &&
    (storageMode === 'cloud_hosted' || storageMode === 'cloud_byo') &&
    auth.status === 'signed_in' &&
    cloudMigration.status.kind !== 'syncing' &&
    cloudMigration.unlinkedCount > 0;

  const handleCloudLoginGoogle = async () => {
    if (cloudBusy) return;
    setCloudBusy(true);
    try {
      setCloudAuthError(null);
      await auth.loginWithGoogle();
    } catch (e: unknown) {
      setCloudAuthError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudLoginGitHub = async () => {
    if (cloudBusy) return;
    setCloudBusy(true);
    try {
      setCloudAuthError(null);
      await auth.loginWithGitHub();
    } catch (e: unknown) {
      setCloudAuthError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudLogout = async () => {
    if (cloudBusy) return;
    setCloudBusy(true);
    try {
      setCloudAuthError(null);
      await auth.logout();
    } catch (e: unknown) {
      setCloudAuthError(e instanceof Error ? e.message : 'Logout failed');
    } finally {
      setCloudBusy(false);
    }
  };

  const handleSyncActive = async () => {
    if (!cloudSync) return;
    await cloudSync.syncActive();
  };

  const handleSyncAll = async () => {
    if (!cloudSync) return;
    await cloudSync.syncAll();
  };

  const handleRefreshCloudProjects = async () => {
    if (!cloudProjects) return;
    await cloudProjects.refresh();
  };

  const handleMigrateAll = async () => {
    if (!cloudMigration) return;
    setCloudMigrationExpanded(true);
    await cloudMigration.migrateAll();
  };

  const handleMigrateActive = async () => {
    if (!cloudMigration) return;
    setCloudMigrationExpanded(true);
    await cloudMigration.migrateActive();
  };

  const handleExport = async () => {
    if (!activeProjectId) return;
    try {
      await onExportProject(activeProjectId);
      setBackupStatus({ kind: 'success', message: 'Exported' });
    } catch {
      setBackupStatus({ kind: 'error', message: 'Export failed' });
    }
  };

  const handleImport = async (file: File) => {
    try {
      await onImportProject(file);
      setBackupStatus({ kind: 'success', message: 'Imported' });
    } catch {
      setBackupStatus({ kind: 'error', message: 'Import failed' });
    }
  };

  const handleTestByo = async () => {
    const result = await onTestByoConfig();
    if (result.ok) {
      setByoStatus({ kind: 'success', message: 'Schema OK' });
    } else {
      setByoStatus({ kind: 'error', message: result.error ?? 'Schema error' });
    }
  };

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
      <div className="px-3 py-2 border-t border-[var(--panel-border)] flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">Backup</span>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void handleImport(file);
              event.currentTarget.value = '';
            }}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={handleExport}
            disabled={!activeProjectId}
            className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
          >
            Export
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
          >
            Import
          </Button>
        </div>
      </div>
      {backupStatus.kind !== 'idle' && (
        <div className="px-3 pb-2 text-[10px] text-slate-400 dark:text-slate-500">
          <span
            className={
              backupStatus.kind === 'error'
                ? 'text-rose-600 dark:text-rose-300'
                : 'text-emerald-600 dark:text-emerald-300'
            }
          >
            {backupStatus.message}
          </span>
        </div>
      )}

      {(storageMode || cloudSync || onStorageModeChange) && (
        <div className="px-3 py-2 border-t border-[var(--panel-border)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 inline-flex items-center gap-1">
              <Cloud size={12} className="opacity-80" /> Cloud
            </span>
            {auth.status === 'signed_in' ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleCloudLogout}
                disabled={cloudBusy || auth.status === 'disabled' || auth.status === 'loading'}
                className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 gap-1"
                title={cloudLabel}
              >
                <UserIcon size={12} className="opacity-80" />
                <LogOut size={12} className="opacity-80" />
                Logout
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCloudLoginGoogle}
                  disabled={cloudBusy || auth.status === 'disabled' || auth.status === 'loading'}
                  className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 gap-1"
                  title="Login with Google"
                >
                  <Chrome size={12} className="opacity-80" />
                  Google
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCloudLoginGitHub}
                  disabled={cloudBusy || auth.status === 'disabled' || auth.status === 'loading'}
                  className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 gap-1"
                  title="Login with GitHub"
                >
                  <Github size={12} className="opacity-80" />
                  GitHub
                </Button>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Status</span>
            <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
              {cloudLabel}
            </span>
          </div>

          {cloudAuthError && (
            <div className="mt-2 text-[10px] text-rose-600 dark:text-rose-300">
              {cloudAuthError}
            </div>
          )}

          {storageMode && onStorageModeChange && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Mode</span>
              <Select
                value={storageMode}
                onChange={(event) => onStorageModeChange(event.target.value as StorageMode)}
                size="xs"
                className="w-[200px]"
              >
                <option value="local">Local</option>
                <option value="cloud_hosted">Cloud (hosted)</option>
                <option value="cloud_byo">Cloud (BYO)</option>
              </Select>
            </div>
          )}

          {cloudSync && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Sync</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSyncActive}
                  disabled={!canSync}
                  className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                >
                  Active
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSyncAll}
                  disabled={!canSync}
                  className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                >
                  All
                </Button>
              </div>
            </div>
          )}

          {cloudSync?.status.kind !== 'idle' && (
            <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
              {cloudSync.status.kind === 'syncing' ? (
                <span className="text-amber-600 dark:text-amber-300">{cloudSync.status.message}</span>
              ) : cloudSync.status.kind === 'error' ? (
                <span className="text-rose-600 dark:text-rose-300">{cloudSync.status.message}</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-300">{cloudSync.status.message}</span>
              )}
            </div>
          )}

          {(cloudMigration || cloudProjects) && (
            <div className="mt-3 border-t border-[var(--panel-border)] pt-2 space-y-3">
              {cloudMigration && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Migration</span>
                      <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {cloudMigration.unlinkedCount} unlinked
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <SectionToggle
                        expanded={cloudMigrationExpanded || cloudMigration.status.kind === 'syncing'}
                        onToggle={() => setCloudMigrationExpanded((v) => !v)}
                      />
                      {cloudMigration.status.kind === 'syncing' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={cloudMigration.cancel}
                          className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
                        >
                          Cancel
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={handleMigrateActive}
                            disabled={!canMigrate}
                            className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 gap-1"
                            title={auth.status === 'signed_in' ? 'Upload active local project' : 'Login required'}
                          >
                            <UploadCloud size={12} className="opacity-80" />
                            Active
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={handleMigrateAll}
                            disabled={!canMigrate}
                            className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 gap-1"
                            title={auth.status === 'signed_in' ? 'Upload all local projects' : 'Login required'}
                          >
                            <UploadCloud size={12} className="opacity-80" />
                            All
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {cloudMigration.status.kind !== 'idle' && (
                    <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                      {cloudMigration.status.kind === 'syncing' ? (
                        <span className="text-amber-600 dark:text-amber-300">{cloudMigration.status.message}</span>
                      ) : cloudMigration.status.kind === 'error' ? (
                        <span className="text-rose-600 dark:text-rose-300">{cloudMigration.status.message}</span>
                      ) : cloudMigration.status.kind === 'cancelled' ? (
                        <span className="text-slate-500 dark:text-slate-400">{cloudMigration.status.message}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-300">{cloudMigration.status.message}</span>
                      )}
                    </div>
                  )}

                  {(cloudMigrationExpanded || cloudMigration.status.kind === 'syncing') && cloudMigration.items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {cloudMigration.items.slice(0, cloudMigrationExpanded ? cloudMigration.items.length : 5).map((it) => (
                        <div
                          key={it.sessionId}
                          className="px-2 py-1.5 rounded-md border border-[var(--panel-border)] bg-[var(--control-bg)]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] text-slate-700 dark:text-slate-200 truncate">{it.title}</div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                {it.status}
                                {it.message ? ` · ${it.message}` : ''}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {cloudProjects && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">Cloud projects</span>
                      <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {cloudProjects.projects.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <SectionToggle expanded={cloudProjectsExpanded} onToggle={() => setCloudProjectsExpanded((v) => !v)} />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleRefreshCloudProjects}
                        disabled={!canBrowseCloudProjects}
                        className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 gap-1"
                        title={auth.status === 'signed_in' ? 'Refresh' : 'Login required'}
                      >
                        <RefreshCw size={12} className="opacity-80" />
                        Refresh
                      </Button>
                    </div>
                  </div>

                  {cloudProjects.status.kind !== 'idle' && (
                    <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                      {cloudProjects.status.kind === 'loading' ? (
                        <span className="text-amber-600 dark:text-amber-300">{cloudProjects.status.message}</span>
                      ) : cloudProjects.status.kind === 'error' ? (
                        <span className="text-rose-600 dark:text-rose-300">{cloudProjects.status.message}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-300">{cloudProjects.status.message}</span>
                      )}
                    </div>
                  )}

                  <div className="mt-2 space-y-1">
                    {(cloudProjectsExpanded ? cloudProjects.projects : cloudProjects.projects.slice(0, 3)).map((project) => (
                      <div
                        key={project.id}
                        className="px-2 py-1.5 rounded-md border border-[var(--panel-border)] bg-[var(--control-bg)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] text-slate-700 dark:text-slate-200 truncate">
                              {project.title ?? project.id}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                              Updated: {formatProjectTimestamp(project.updatedAt)}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void cloudProjects.importFromCloud(project.id)}
                            disabled={!canBrowseCloudProjects}
                            className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 gap-1"
                          >
                            <Download size={12} className="opacity-80" />
                            Import
                          </Button>
                        </div>
                      </div>
                    ))}

                    {cloudProjects.projects.length === 0 && (
                      <div className="px-2 py-1 text-[10px] text-slate-400 dark:text-slate-500">
                        No cloud projects yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2 border-t border-[var(--panel-border)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-slate-400 dark:text-slate-500">BYO Supabase</span>
          </div>
          <div className="flex items-center gap-1">
            <SectionToggle expanded={byoExpanded} onToggle={() => setByoExpanded((v) => !v)} />
            <Button
              type="button"
              variant="ghost"
              onClick={handleTestByo}
              className="text-[10px] px-2 py-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700"
            >
              Test
            </Button>
          </div>
        </div>

        {byoExpanded && (
          <div className="mt-2 space-y-2">
            <Input
              value={byoConfig.url}
              onChange={(e) => onByoConfigChange({ url: e.target.value })}
              placeholder="Supabase URL"
              size="sm"
            />
            <Input
              type="password"
              value={byoConfig.anonKey}
              onChange={(e) => onByoConfigChange({ anonKey: e.target.value })}
              placeholder="Anon key"
              size="sm"
            />
          </div>
        )}
        {byoStatus.kind !== 'idle' && (
          <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            <span
              className={
                byoStatus.kind === 'error'
                  ? 'text-rose-600 dark:text-rose-300'
                  : 'text-emerald-600 dark:text-emerald-300'
              }
            >
              {byoStatus.message}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsMenu;
