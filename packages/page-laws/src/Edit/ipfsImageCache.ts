// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getIPFSBytesFromContentID } from '@slonigiraf/slonig-components';
import { fileTypeFromBuffer } from 'file-type';

const MAX_CACHED_IMAGES = 400;
const MAX_CACHED_BYTES = 96 * 1024 * 1024;

interface CachedImage {
  bytes: number;
  url: string;
}

const images = new Map<string, CachedImage>();
const loadingImages = new Map<string, Promise<string>>();
let cachedBytes = 0;

/** The CID is content-addressed, so a previously loaded SVG/blob can be safely
 * reused across all Abilities panes without another slow IPFS retrieval. */
export function getCachedIpfsImageUrl (cid: string): string | undefined {
  const value = images.get(cid);

  if (value) {
    images.delete(cid);
    images.set(cid, value);
  }

  return value?.url;
}

export async function loadCachedIpfsImageUrl (ipfs: Parameters<typeof getIPFSBytesFromContentID>[0], cid: string): Promise<string> {
  const cached = getCachedIpfsImageUrl(cid);

  if (cached) {
    return cached;
  }

  const loading = loadingImages.get(cid);

  if (loading) {
    return loading;
  }

  const request = (async (): Promise<string> => {
    const bytes = await getIPFSBytesFromContentID(ipfs, cid);
    const prefix = new TextDecoder('utf-8').decode(bytes.slice(0, 512));
    const isSvg = /^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(prefix.trim());
    const mimeType = isSvg ? 'image/svg+xml' : (await fileTypeFromBuffer(bytes))?.mime || 'application/octet-stream';
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));

    // The image may have been loaded while this async request was pending.
    const existing = getCachedIpfsImageUrl(cid);

    if (existing) {
      URL.revokeObjectURL(url);
      return existing;
    }

    images.set(cid, { bytes: bytes.byteLength, url });
    cachedBytes += bytes.byteLength;

    while (images.size > MAX_CACHED_IMAGES || (cachedBytes > MAX_CACHED_BYTES && images.size > 1)) {
      const oldest = images.keys().next().value as string | undefined;

      if (!oldest) {
        break;
      }

      const evicted = images.get(oldest);

      images.delete(oldest);
      if (evicted) {
        cachedBytes -= evicted.bytes;
        URL.revokeObjectURL(evicted.url);
      }
    }

    return url;
  })();

  loadingImages.set(cid, request);

  try {
    return await request;
  } finally {
    if (loadingImages.get(cid) === request) {
      loadingImages.delete(cid);
    }
  }
}
