// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** A narrow, observable ability taught within a book chapter. */
export interface Skill {
  id?: number;
  chapterId: number;
  title: string;
  description: string;
}
