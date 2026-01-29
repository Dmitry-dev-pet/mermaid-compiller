import { safeParse } from '../../utils';
import type { StorageProviderKind } from './types';

export type CloudLink = {
  providerKind: StorageProviderKind;
  remoteProjectId: string;
  remoteVersion: number;
};

export type CloudLinks = Record<string, CloudLink>;

const LINKS_KEY = 'dc_cloud_links_v1';

export const readCloudLinks = (): CloudLinks => {
  const parsed = safeParse(LINKS_KEY, {});
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed as CloudLinks;
};

export const writeCloudLinks = (links: CloudLinks) => {
  localStorage.setItem(LINKS_KEY, JSON.stringify(links));
};

export const getCloudLink = (sessionId: string): CloudLink | null => {
  const links = readCloudLinks();
  return links[sessionId] ?? null;
};

export const setCloudLink = (sessionId: string, link: CloudLink) => {
  const links = readCloudLinks();
  links[sessionId] = link;
  writeCloudLinks(links);
};

