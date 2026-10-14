// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { SettingKey, storeSetting } from '@slonigiraf/db';

export type OperationPhase = 'idle' | 'generating' | 'generated' | 'download-initiated' |
  'saved' | 'confirmed' | 'validating' | 'staging' | 'committing' |
  'restored' | 'cancelled' | 'error';
export interface OperationStatus {
  phase: OperationPhase;
  completed: number;
  total: number;
  unit: 'tables' | 'frames' | 'bytes' | 'steps';
  message: string;
  warnings: string[];
  error?: string;
  updatedAt: number;
}
export type StatusListener = (status: OperationStatus) => void;
const STATUS_KEY_PREFIX = 'slonig:operation-status:';

export function persistBackupStatus(status: OperationStatus, kind: string): void {
  try { localStorage.setItem(STATUS_KEY_PREFIX + kind, JSON.stringify(status)); } catch { /* private storage unavailable */ }
}
export async function confirmBackupCompletion(): Promise<void> {
  // A launched browser download and a completed native save both count as backup
  // completion. Dismissing the reminder does not count.
  await storeSetting(SettingKey.LAST_BACKUP_TIME, Date.now().toString());
}

export abstract class OperationService {
  private readonly kind: 'backup' | 'restore';
  protected constructor(kind: 'backup' | 'restore') { this.kind = kind; }
  protected controller?: AbortController;
  private readonly listeners = new Set<StatusListener>();
  private state: OperationStatus = {
    phase: 'idle', completed: 0, total: 0, unit: 'steps', message: '', warnings: [], updatedAt: Date.now()
  };
  get status(): OperationStatus { return this.state; }
  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }
  protected set(phase: OperationPhase, message: string, completed = 0, total = 0, unit: OperationStatus['unit'] = 'steps'): void {
    this.state = { ...this.state, phase, message, completed, total, unit, error: undefined, updatedAt: Date.now() };
    for (const listener of this.listeners) listener(this.state);
    persistBackupStatus(this.state, this.kind);
  }
  protected warn(message: string): void {
    this.state = { ...this.state, warnings: [...this.state.warnings, message], updatedAt: Date.now() };
    for (const listener of this.listeners) listener(this.state);
    persistBackupStatus(this.state, this.kind);
  }
  protected fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.state = { ...this.state, phase: this.controller?.signal.aborted ? 'cancelled' : 'error', error: message, message, updatedAt: Date.now() };
    for (const listener of this.listeners) listener(this.state);
    persistBackupStatus(this.state, this.kind);
  }
  // Only a deliberate user action should cancel an active operation. An IndexedDB
  // AbortError on its own is a restore failure and must not be mislabeled.
  cancel(): void {
    if (this.controller && ['generating', 'generated', 'validating', 'staging', 'committing'].includes(this.state.phase)) {
      this.controller.abort();
    }
  }
  protected begin(): AbortSignal {
    if (this.controller && !this.controller.signal.aborted && !['saved', 'restored', 'error', 'cancelled', 'confirmed', 'download-initiated', 'idle'].includes(this.state.phase)) {
      throw new Error('An operation is already running');
    }
    this.controller = new AbortController();
    // A second backup must never inherit the previous completed percentage.
    this.state = {
      ...this.state, phase: 'idle', completed: 0, total: 0, unit: 'steps',
      message: '', warnings: [], error: undefined, updatedAt: Date.now()
    };
    return this.controller.signal;
  }
}
