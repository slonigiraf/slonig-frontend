// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface StandardEmbedding {
  id: string;
  /** Embedding model that produced this vector. Legacy rows may omit it. */
  model?: string;
  embedding: number[];
}
