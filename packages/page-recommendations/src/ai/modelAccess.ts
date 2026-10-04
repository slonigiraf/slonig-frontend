import { DEFAULT_MODEL } from './openRouter.js';

export function isAiTutorModelSelectionEnabled(hostname?: string): boolean {
  const currentHostname = hostname ?? (typeof window === 'undefined' ? '' : window.location.hostname);

  return currentHostname === 'localhost'
    || currentHostname === '127.0.0.1'
    || currentHostname === '::1'
    || currentHostname === '[::1]';
}

export function resolveAiTutorModel(selectedModel: string, canChangeModel: boolean): string {
  if (!canChangeModel) return DEFAULT_MODEL;

  return selectedModel.trim() || DEFAULT_MODEL;
}
