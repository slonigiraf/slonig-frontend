// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | undefined;

/**
 * Load PDF.js only when a PDF operation is requested. Keeping this behind a
 * dynamic import prevents the parser and worker bootstrap from entering the
 * initial application chunk.
 */
export function loadPdfJs (): Promise<typeof import('pdfjs-dist')> {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

      return pdfjs;
    });
  }

  return pdfJsPromise;
}
