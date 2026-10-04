// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { unzipSync } from 'fflate';

import { markdownImageReferences } from '../../domain/content/markdownImages.js';

export interface MmdImageAsset {
  dataUrl: string;
  name: string;
}

const IMAGE_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

function bytesToBase64 (bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return globalThis.btoa(binary);
}

function normalizeImageReference (value: string): string {
  let decoded = value.trim().replace(/\\/g, '/').split(/[?#]/, 1)[0];

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // A malformed percent escape should not make a whole book page unusable.
  }

  return decoded.replace(/^\.\//, '').replace(/^\//, '').replace(/\/+/g, '/').toLocaleLowerCase();
}

function basename (value: string): string {
  return value.slice(value.lastIndexOf('/') + 1);
}

export function resolveMarkdownImageAssets (text: string, assets: MmdImageAsset[]): MmdImageAsset[] {
  const result: MmdImageAsset[] = [];
  const seen = new Set<string>();

  for (const reference of markdownImageReferences(text)) {
    if (/^(?:data:image\/|blob:|https?:\/\/)/i.test(reference)) {
      if (!seen.has(reference)) {
        seen.add(reference);
        result.push({ dataUrl: reference, name: reference });
      }

      continue;
    }

    const normalizedReference = normalizeImageReference(reference);
    const referenceBasename = basename(normalizedReference);
    const asset = assets.find(({ name }) => {
      const normalizedName = normalizeImageReference(name);

      return normalizedName === normalizedReference ||
        normalizedName.endsWith(`/${normalizedReference}`) ||
        basename(normalizedName) === referenceBasename;
    });

    if (asset && !seen.has(asset.dataUrl)) {
      seen.add(asset.dataUrl);
      result.push(asset);
    }
  }

  return result;
}

export async function extractMmdZipImageAssets (blob: Blob): Promise<MmdImageAsset[]> {
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));

  return Object.entries(entries).flatMap(([name, bytes]) => {
    const extension = name.split('.').pop()?.toLocaleLowerCase() ?? '';
    const imageType = IMAGE_TYPES[extension];

    return imageType
      ? [{ dataUrl: `data:${imageType};base64,${bytesToBase64(bytes)}`, name }]
      : [];
  });
}

export { markdownImageReferences, stripMarkdownImageReferences } from '../../domain/content/markdownImages.js';
