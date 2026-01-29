import type { ProjectBlob } from './types';
import type { ProjectBundleFile, SessionBundle } from '../history/bundle';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encodeProjectBundleToBlob = (bundle: SessionBundle): ProjectBlob => {
  const payload: ProjectBundleFile = {
    schema: 'mermaid-langgraph.project',
    version: 1,
    exportedAt: Date.now(),
    bundle,
  };
  return encoder.encode(JSON.stringify(payload));
};

export const decodeProjectBundleFromBlob = (blob: ProjectBlob): SessionBundle => {
  const text = decoder.decode(blob);
  const parsed = JSON.parse(text) as Partial<ProjectBundleFile>;
  if (parsed?.schema !== 'mermaid-langgraph.project' || parsed.version !== 1 || !parsed.bundle) {
    throw new Error('Invalid project bundle');
  }
  return parsed.bundle;
};

