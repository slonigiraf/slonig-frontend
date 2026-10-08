// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Durable JSON-like state produced by background book processing. The DB layer
 * intentionally does not depend on page-laws domain types; callers own the
 * schema for each key.
 */
export interface BookProcessingArtifact {
  bookId: number;
  key: string;
  updatedAt: number;
  value: unknown;
}
