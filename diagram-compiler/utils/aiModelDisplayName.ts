import type { Model } from '../types';

type ModelLike = Pick<Model, 'id' | 'name' | 'ownedBy'>;

export const getModelDisplayName = (model: ModelLike): string => {
  const baseName = model.name || model.id;
  const cleaned = baseName.replace(/\bantigravity\b[:/-]?\s*/gi, '').trim();
  if (cleaned.length > 0) return cleaned;
  return baseName;
};
