// Copyright 2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Successfully pinned Ability JSON, reusable only for the same exact payload. */
export interface SkillUploadCheckpoint {
  bookId: number;
  chainGenesisHash: string;
  abilityId: string;
  contentHash: string;
  ipfsDigest: string;
  uploadedAt: number;
}
