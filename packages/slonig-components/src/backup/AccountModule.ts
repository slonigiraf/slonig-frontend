// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { keyring } from '@polkadot/ui-keyring';

// Account exports use the existing password convention for compatibility.
// WARNING: this is not secure encryption! Treat downloaded archives as secrets.
const LEGACY_PASSWORD = 'password';
export type BackupKey = ReturnType<typeof keyring.backupAccount>;
export function exportAccountKeys(currentAddress?: string): BackupKey[] {
  const accounts = keyring.getPairs();
  if (!accounts.length) throw new Error('No accounts to back up');
  const ordered = [...accounts].sort((a, b) => Number(b.address === currentAddress) - Number(a.address === currentAddress));
  return ordered.map((account) => keyring.backupAccount(account, LEGACY_PASSWORD));
}
export function validateAccountKeys(value: unknown): asserts value is BackupKey[] {
  if (!Array.isArray(value) || !value.length || value.length > 10000 ||
      value.some((key) => !key || typeof key !== 'object' || typeof key.address !== 'string' ||
        !key.address || typeof key.encoded !== 'string' || !key.encoding || typeof key.encoding !== 'object') ||
      new Set(value.map((key) => key.address)).size !== value.length) {
    throw new Error('Invalid account keys in backup');
  }
}

/** Existing accounts are left untouched. New accounts are removed on rollback. */
export class StagedAccounts {
  private restored: string[] = [];
  constructor(readonly keys: BackupKey[]) { validateAccountKeys(keys); }
  apply(): void {
    const existing = new Set(keyring.getPairs().map(({ address }) => address));
    for (const key of this.keys) {
      if (existing.has(key.address)) continue;
      keyring.restoreAccount(key, LEGACY_PASSWORD);
      this.restored.push(key.address);
    }
  }
  rollback(): void {
    for (const address of this.restored.reverse()) keyring.forgetAccount(address);
    this.restored = [];
  }
  get firstAddress(): string { return this.keys[0].address; }
}
