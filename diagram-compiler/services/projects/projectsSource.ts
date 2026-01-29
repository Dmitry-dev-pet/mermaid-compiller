import type { HistorySession } from '../history/types';
import type { ProjectMeta } from '../storage';

export type ProjectsSourceKind = 'local' | 'cloud';

export type ProjectsSourceItem<T> = {
  kind: ProjectsSourceKind;
  id: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
  data: T;
};

export type ProjectsSource<T> = {
  kind: ProjectsSourceKind;
  items: ProjectsSourceItem<T>[];
};

export const createLocalProjectsSource = (projects: HistorySession[]): ProjectsSource<HistorySession> => {
  return {
    kind: 'local',
    items: projects.map((project) => ({
      kind: 'local',
      id: project.id,
      title: project.title ?? 'Project',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt ?? project.createdAt,
      data: project,
    })),
  };
};

export const createCloudProjectsSource = (projects: ProjectMeta[]): ProjectsSource<ProjectMeta> => {
  return {
    kind: 'cloud',
    items: projects.map((project) => ({
      kind: 'cloud',
      id: project.id,
      title: project.title ?? project.id,
      updatedAt: project.updatedAt,
      data: project,
    })),
  };
};

