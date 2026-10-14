// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
/** Single-inflight worker: limits memory and keeps compression off the UI thread. */
export class CompressionClient {
  private readonly worker = new Worker(new URL('./compression.worker.ts', import.meta.url), { type: 'module' });
  private count = 0;
  private pending = new Map<number, { resolve: (value: Uint8Array) => void; reject: (error: Error) => void }>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<{ id: number; bytes?: ArrayBuffer; error?: string }>) => {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error));
      else if (data.bytes) pending.resolve(new Uint8Array(data.bytes));
      else pending.reject(new Error('Compression worker returned no data'));
    };
    this.worker.onerror = () => this.stop(new Error('Compression worker failed'));
  }
  run(action: 'compress' | 'decompress', input: Uint8Array): Promise<Uint8Array> {
    const task = (): Promise<Uint8Array> => new Promise((resolve, reject) => {
      const id = ++this.count;
      this.pending.set(id, { resolve, reject });
      const bytes = new Uint8Array(input); // transfer ownership without detaching caller's input
      this.worker.postMessage({ id, action, bytes: bytes.buffer }, [bytes.buffer]);
    });
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
  stop(error = new Error('Operation cancelled')): void {
    this.worker.terminate();
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
  }
}
