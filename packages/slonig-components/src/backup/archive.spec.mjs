import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ArchiveWriter, readArchive, verifyArchive } from './archive.ts';
import { BackupBatchTooLargeError, concat, encodeDatabaseRows, decodeDatabaseRows, utf8 } from './codec.ts';
import { migrateBackupRows } from './migrations.ts';

// The browser uses an actual Web Worker. This test double checks the portable
// format and checksum logic independent of the browser's Worker implementation.
const client = {
  async run(action, bytes) {
    return new Uint8Array(action === 'compress' ? gzipSync(bytes) : gunzipSync(bytes));
  }
};
async function makeArchive(rows, extraFrames = []) {
  const writer = new ArchiveWriter(client);
  const parts = [writer.header()];
  parts.push(await writer.frame({ kind: 'metadata', bytes: utf8(JSON.stringify({ format: 'slonig-backup', formatVersion: 1, tables: ['settings'] })) }));
  parts.push(await writer.frame({ kind: 'keys', bytes: utf8(JSON.stringify([{ address: 'test-account' }])) }));
  parts.push(await writer.frame({ kind: 'db', name: 'settings', bytes: await encodeDatabaseRows(rows) }));
  for (const entry of extraFrames) parts.push(await writer.frame(entry));
  parts.push(await writer.frame({ kind: 'footer', bytes: utf8(JSON.stringify({ entries: writer.entries, rowCounts: { settings: rows.length }, pdfFiles: extraFrames.filter(({ kind }) => kind === 'pdf').map(({ name }) => name) })) }));
  return new Blob(parts);
}

describe('versioned Slonig backup round-trip', () => {
  it('preserves account bytes, Date, Blob, ArrayBuffer, typed arrays, BigInt and undefined', async () => {
    const rows = [{ id: 'binary', value: new Uint8Array([0, 255, 128]), date: new Date('2022-12-31T00:00:00Z'),
      pdfBytes: new Blob([new Uint8Array([37, 80, 68, 70, 45, 0, 255])], { type: 'application/pdf' }),
      buffer: new Uint8Array([0, 4]).buffer, large: 12n, missing: undefined }];
    const backup = await makeArchive(rows, [{ kind: 'pdf', name: 'book.pdf', bytes: utf8('%PDF-\0\xff') }]);
    await verifyArchive(backup, client);
    const entries = [];
    for await (const entry of readArchive(backup, client)) entries.push(entry);
    assert.deepEqual(entries.map((entry) => entry.kind), ['metadata', 'keys', 'db', 'pdf', 'footer']);
    assert.equal(JSON.parse(new TextDecoder().decode(entries[1].bytes))[0].address, 'test-account');
    const decoded = decodeDatabaseRows(entries[2].bytes)[0];
    assert.deepEqual([...decoded.value], [0, 255, 128]);
    assert.equal(decoded.date.toISOString(), '2022-12-31T00:00:00.000Z');
    assert.equal(decoded.large, 12n);
    assert.equal(decoded.missing, undefined);
    assert.deepEqual([...new Uint8Array(await decoded.pdfBytes.arrayBuffer())], [37, 80, 68, 70, 45, 0, 255]);
    assert.deepEqual([...new Uint8Array(decoded.buffer)], [0, 4]);
  });
  it('keeps large binary records compact and byte-for-byte correct', async () => {
    const raw = new Uint8Array(4 * 1024 * 1024);
    for (let i = 0; i < raw.length; i++) raw[i] = i % 251;
    const encoded = await encodeDatabaseRows([{
      id: 'large', payload: new Blob([raw], { type: 'application/octet-stream' }),
      array: new Uint32Array([0, 1, 65536, 4294967295]),
      view: new DataView(new Uint8Array([1, 2, 3, 4]).buffer)
    }]);
    assert.ok(encoded.byteLength < raw.length * 1.1, 'binary sidecar avoids JSON numeric array blowup');
    const result = decodeDatabaseRows(encoded)[0];
    assert.deepEqual(new Uint8Array(await result.payload.arrayBuffer()), raw);
    assert.deepEqual([...result.array], [0, 1, 65536, 4294967295]);
    assert.equal(result.view.getUint8(3), 4);
  });
  it('refuses oversized frames before materializing them', async () => {
    const large = new Blob([new Uint8Array(13 * 1024 * 1024)]);
    await assert.rejects(encodeDatabaseRows([{ id: 'large', data: large }]), BackupBatchTooLargeError);
    const first = new Uint8Array(7 * 1024 * 1024);
    await assert.rejects(encodeDatabaseRows([{ id: 1, data: first }, { id: 2, data: first }]), BackupBatchTooLargeError);
    assert.equal(decodeDatabaseRows(await encodeDatabaseRows([{ id: 1, data: first }])).length, 1);
  });
  it('reads older JSON-only database backup frames', () => {
    const legacy = utf8(JSON.stringify([{ id: 'legacy', bytes: { __slonigType: 'TypedArray', ctor: 'Uint8Array', data: [0, 42, 255] } }]));
    assert.deepEqual([...decodeDatabaseRows(legacy)[0].bytes], [0, 42, 255]);
  });
  it('reports actual checksum-verified archive bytes, never a guessed percentage', async () => {
    const archive = await makeArchive(Array.from({ length: 120 }, (_, i) => ({ id: i, name: `record${i}` })));
    const seen = [];
    await verifyArchive(archive, client, undefined, (bytes, total) => {
      assert.equal(total, archive.size);
      seen.push(bytes);
    });
    assert.ok(seen.length >= 4, 'progress advances after separate verified frames');
    assert.deepEqual(seen, [...seen].sort((a, b) => a - b));
    assert.equal(seen.at(-1), archive.size);
    assert.ok(seen[0] < archive.size);
    const corrupted = new Uint8Array(await archive.arrayBuffer());
    corrupted[Math.floor(corrupted.length / 2)] ^= 1;
    await assert.rejects(verifyArchive(new Blob([corrupted]), client));
  });
  it('detects corruption and truncated archives', async () => {
    const backup = new Uint8Array(await (await makeArchive([{ id: 'a' }])).arrayBuffer());
    backup[backup.length - 40] ^= 0xff;
    await assert.rejects(verifyArchive(new Blob([backup]), client));
    const valid = new Uint8Array(await (await makeArchive([{ id: 'a' }])).arrayBuffer());
    await assert.rejects(verifyArchive(new Blob([valid.subarray(0, valid.length - 12)]), client));
  });
  it('streams thousands of independent frames without loading full archive', async () => {
    const records = Array.from({ length: 3000 }, (_, index) => ({ id: String(index), bytes: new Uint8Array([index % 256, 0, 255]) }));
    const frames = [];
    for (let i = 0; i < records.length; i += 100) frames.push({ kind: 'db', name: 'settings', bytes: await encodeDatabaseRows(records.slice(i, i + 100)) });
    const archive = await makeArchive([], frames);
    let count = 0;
    for await (const entry of readArchive(archive, client)) if (entry.kind === 'db') count += decodeDatabaseRows(entry.bytes).length;
    assert.equal(count, 3000);
  });
  it('verifies .slonig archives without changing binary framing', async () => {
    const data = await makeArchive([{ id: 'extension-compatible' }]);
    const file = new File([data], 'Test_20261014_23_07.slonig', { type: 'application/octet-stream' });
    await verifyArchive(file, client);
    const entries = [];
    for await (const entry of readArchive(file, client)) entries.push(entry.kind);
    assert.deepEqual(entries, ['metadata', 'keys', 'db', 'footer']);
    const bytes = new Uint8Array(await data.slice(0, 8).arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes), 'SLONIGBK');
  });
  it('migrates historical skill and exercise template fields', () => {
    assert.deepEqual(migrateBackupRows(80, 'skills', [{ id: 1, bookExerciseIds: [42] }]), [{ id: 1, exerciseIds: [42] }]);
    assert.deepEqual(migrateBackupRows(80, 'exerciseTemplates', [{ id: 7, bookSkillId: 1 }]), [{ id: 7, skillId: 1 }]);
    assert.deepEqual(migrateBackupRows(105, 'skills', [{ id: 3, exerciseIds: [42] }]), [{ id: 3, exerciseIds: [42] }]);
  });
});
