// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export type ImageType = 'prompt' | 'tikz';
export type TikzQaStatus = 'pending' | 'passed' | 'failed';

export interface TikzReviewResult {
  /** The exact source revision that the vision model was shown as a PNG. */
  sourceVersion: string;
  hasErrors: boolean;
  errors: string[];
  reviewedAt: number;
  /** One-based review pass for this candidate (maximum three). */
  attempt: number;
}

export interface Image {
  id: number;
  type: ImageType;
  /** Semantic visual specification used to generate and repair the image. */
  prompt: string;
  /** Generated visual payload. Null until generation produces image/TikZ content. */
  data: string | null;
  /** Legacy compatibility: indicates render success only, NOT visual QA approval. */
  valid: boolean | undefined;
  renderStatus?: TikzQaStatus;
  visualQaStatus?: TikzQaStatus;
  detectedIssues?: string[];
  sourceVersion?: string;
  reviewResult?: TikzReviewResult;
}

/** Deterministic version of the source, invalidated by any edited TikZ text. */
export function tikzSourceVersion (source: string): string {
  let first = 2166136261;
  let second = 0x811c9dc5;

  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);

    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ (code + index), 16777619);
  }

  return `tikz-v1:${source.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function isTikzImageQaPassed (image: Image): boolean {
  return image.type === 'tikz' && typeof image.data === 'string' &&
    image.sourceVersion === tikzSourceVersion(image.data) &&
    image.renderStatus === 'passed' && image.visualQaStatus === 'passed' &&
    image.reviewResult?.sourceVersion === image.sourceVersion &&
    image.reviewResult.hasErrors === false &&
    image.reviewResult.attempt >= 1 && image.reviewResult.attempt <= 3 &&
    image.detectedIssues?.length === 0;
}
