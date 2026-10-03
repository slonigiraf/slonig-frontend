// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface ConceptEmbedding {
  id: number;
  bookId: number;
  /** Embedding model that produced this vector. Legacy rows may omit it. */
  model?: string;
  /** Exact title + description input used to create the embedding. */
  input: string;
  embedding: number[];
}
