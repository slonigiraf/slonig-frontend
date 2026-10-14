// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import pako from 'pako';

self.onmessage = (event: MessageEvent<{ id: number; action: 'compress' | 'decompress'; bytes: ArrayBuffer }>): void => {
  const { id, action, bytes } = event.data;
  try {
    // Every frame is compressed independently, bounding both input and output.
    let output: Uint8Array;
    if (action === 'compress') {
      output = pako.gzip(new Uint8Array(bytes));
    } else {
      // Reject decompression bombs before accumulating an unbounded result.
      const inflate = new pako.Inflate();
      const chunks: Uint8Array[] = [];
      let size = 0;
      inflate.onData = (chunk: Uint8Array) => {
        size += chunk.byteLength;
        if (size > 32 * 1024 * 1024) throw new Error('Decompressed frame exceeds limit');
        chunks.push(chunk);
      };
      inflate.push(new Uint8Array(bytes), true);
      if (inflate.err) throw new Error(inflate.msg);
      output = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    }
    self.postMessage({ id, bytes: output.buffer }, { transfer: [output.buffer] });
  } catch (error) {
    self.postMessage({ id, error: (error as Error).message });
  }
};
