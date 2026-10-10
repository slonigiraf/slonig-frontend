// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Rasterize the exact SVG returned by TikZ Editor, not reconstructed TikZ or SVG text.
 * A missing/failed canvas is a hard QA failure: never silently send SVG instead.
 */
export async function rasterizeTikzSvg (svg: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('TikZ visual QA requires a browser canvas to rasterize the rendered SVG.');
  }

  const documentResult = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = documentResult.documentElement;

  if (documentResult.querySelector('parsererror') || root.localName !== 'svg') {
    throw new Error('TikZ Editor returned SVG that cannot be rasterized.');
  }

  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const fallbackWidth = viewBox?.length === 4 && viewBox[2] > 0 ? viewBox[2] : 640;
  const fallbackHeight = viewBox?.length === 4 && viewBox[3] > 0 ? viewBox[3] : 480;
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to decode TikZ Editor SVG for visual QA.'));
    });

    image.src = url;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        loaded,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('TikZ SVG rasterization timed out.')), 10_000);
        })
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }

    const hasViewBox = viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0;
    const width = hasViewBox ? fallbackWidth : image.naturalWidth || fallbackWidth;
    const height = hasViewBox ? fallbackHeight : image.naturalHeight || fallbackHeight;
    const scale = Math.min(2, 2048 / Math.max(width, height));
    const canvas = document.createElement('canvas');

    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Browser canvas is unavailable for TikZ visual QA.');
    }

    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');

    if (!png.startsWith('data:image/png;base64,')) {
      throw new Error('TikZ rasterization did not produce a PNG.');
    }

    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}
