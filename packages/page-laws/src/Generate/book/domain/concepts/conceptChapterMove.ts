// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export function conceptChapterMoveInsertionIndex (sourceChapterIndex: number, targetChapterIndex: number, targetConceptCount: number): number {
  if (sourceChapterIndex < targetChapterIndex) {
    return 0;
  }

  if (sourceChapterIndex > targetChapterIndex) {
    return targetConceptCount;
  }

  return targetConceptCount;
}
