// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface AbilityExercise {
  a: string;
  h: string;
  i: number | null;
  p: number | null;
}

export interface AbilityValue {
  h: string;
  i: string;
  q: AbilityExercise[];
  t: number;
}

export interface Ability {
  id: string;
  moduleId: string;
  /** Serialized AbilityValue. Visual payloads live in Image rows referenced by q[].p/q[].i. */
  content: string;
}
