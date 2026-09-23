// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export type ImageType = 'prompt' | 'tikz';

export interface Image {
  id: number;
  type: ImageType;
  /** Semantic visual specification used to generate and repair the image. */
  prompt: string;
  /** Generated visual payload. Null until generation produces image/TikZ content. */
  data: string | null;
  valid: boolean | undefined;
}
