// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Only .slonig backups can be selected for restoration. */
export function assertSlonigBackupFile(file: Pick<File, 'name'>): void {
  if (typeof file.name !== 'string' || !/\.slonig$/i.test(file.name)) {
    throw new Error('Please select a .slonig backup file.');
  }
}
