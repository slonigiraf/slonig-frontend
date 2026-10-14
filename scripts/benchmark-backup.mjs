// Copyright 2026 @slonigiraf/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Node archive-pipeline benchmark (browser IndexedDB/OPFS benchmarks additionally
// need running in a deployed app; the numbers below are not UI end-to-end timing).
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ArchiveWriter, readArchive } from '../packages/slonig-components/src/backup/archive.ts';
import { encodeDatabaseRows, decodeDatabaseRows, utf8 } from '../packages/slonig-components/src/backup/codec.ts';
const worker = { async run(action, bytes) { return new Uint8Array(action === 'compress' ? gzipSync(bytes) : gunzipSync(bytes)); } };
const count = Number(process.argv[2] || 10000);
const batchSize = 100;
const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
const memoryBaseline = process.memoryUsage().rss;
let peakMemory = memoryBaseline;
const checkMemory = () => { peakMemory = Math.max(peakMemory, process.memoryUsage().rss); };
const writer = new ArchiveWriter(worker);
const parts = [writer.header()];
const start = performance.now();
parts.push(await writer.frame({ kind: 'metadata', bytes: utf8('{}') }));
parts.push(await writer.frame({ kind: 'keys', bytes: utf8('[{"address":"bench"}]') }));
for (let i = 0; i < count; i += batchSize) {
  const rows = Array.from({ length: Math.min(batchSize, count - i) }, (_, n) => ({
    id: i + n, binary: new Uint8Array(1024).fill((i + n) % 251), when: new Date('2026-01-01')
  }));
  parts.push(await writer.frame({ kind: 'db', name: 'lessons', bytes: await encodeDatabaseRows(rows) }));
  if (i % 500 === 0) { checkMemory(); await new Promise((resolve) => setImmediate(resolve)); }
}
parts.push(await writer.frame({ kind: 'footer', bytes: utf8(JSON.stringify({ entries: writer.entries })) }));
const backupMs = performance.now() - start;
const file = new Blob(parts);
const restoreStart = performance.now();
let restored = 0;
for await (const entry of readArchive(file, worker)) {
  if (entry.kind === 'db') restored += decodeDatabaseRows(entry.bytes).length;
  checkMemory();
  if (restored % 500 === 0) await new Promise((resolve) => setImmediate(resolve));
}
const restoreMs = performance.now() - restoreStart;
delay.disable();
if (restored !== count) throw new Error('Row count mismatch');
console.log(JSON.stringify({
  benchmark: 'archive-pipeline-not-full-browser', records: count, archiveBytes: file.size,
  backupMs: +backupMs.toFixed(2), restoreMs: +restoreMs.toFixed(2),
  peakRssMiB: +(peakMemory / 1024 / 1024).toFixed(2),
  rssIncreaseMiB: +((peakMemory - memoryBaseline) / 1024 / 1024).toFixed(2),
  eventLoopMaxDelayMs: +(delay.max / 1e6).toFixed(2),
  note: 'Node zlib adapter, not Web Worker; browser UI responsiveness must be measured in browser'
}, null, 2));
