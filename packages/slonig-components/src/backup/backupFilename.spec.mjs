import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { backupFilename } from './backupFilename.ts';

const src = new URL('../', import.meta.url);
const code = async (path) => readFile(new URL(path, src), 'utf8');

describe('backup filenames use the account display name and local start time', () => {
  const startedAt = new Date(2026, 9, 14, 23, 7); // local time: YYYYMMDD_HH_MM

  it('replaces account whitespace with underscores while preserving Unicode', () => {
    assert.equal(backupFilename('Jane Smith', startedAt), 'Jane_Smith_20261014_23_07.slonig');
    assert.equal(backupFilename('Zoë Ångström', startedAt), 'Zoë_Ångström_20261014_23_07.slonig');
    assert.equal(backupFilename('  Alice   Bob  ', startedAt), 'Alice_Bob_20261014_23_07.slonig');
    assert.equal(backupFilename(' Alice\tBob\nSmith ', startedAt), 'Alice_Bob_Smith_20261014_23_07.slonig');
    assert.equal(backupFilename('Jean\u00a0Luc', startedAt), 'Jean_Luc_20261014_23_07.slonig');
  });
  it('handles invalid or empty filenames without changing the archive extension', () => {
    assert.equal(backupFilename('Family/Work: 2026?', startedAt), 'Family_Work__2026__20261014_23_07.slonig');
    assert.equal(backupFilename('CON', startedAt), '_CON_20261014_23_07.slonig');
    assert.equal(backupFilename('  ...  ', startedAt), 'backup_20261014_23_07.slonig');
    assert.equal(backupFilename(undefined, startedAt), 'backup_20261014_23_07.slonig');
    assert.equal(backupFilename('a'.repeat(200), startedAt), `${'a'.repeat(120)}_20261014_23_07.slonig`);
  });
  it('uses local hours with leading zeros and handles the year boundary', () => {
    assert.equal(backupFilename('A', new Date(2027, 0, 1, 0, 3)), 'A_20270101_00_03.slonig');
    assert.equal(backupFilename('A', new Date(2026, 11, 31, 9, 59)), 'A_20261231_09_59.slonig');
  });
  it('uses one generated name for native saves and browser fallback', async () => {
    const service = await code('backup/BackupService.ts');
    const view = await code('DBExport.tsx');
    assert.match(service, /const fileName = backupFilename\(accountName \|\| address, new Date\(\)\)/);
    assert.match(service, /suggestedName: fileName/);
    assert.match(service, /accept: \{ 'application\/octet-stream': \['\.slonig'\] \}/);
    assert.doesNotMatch(service, /'\.slonigbk'/);
    assert.match(service, /link\.download = fileName/);
    assert.match(service, /exportAccountKeys\(address\)/); // account selection is unchanged
    assert.match(view, /nameFromKeyringPair\(currentPair\)/);
    assert.match(view, /service\.start\(currentPair\?\.address,/);
  });
});
