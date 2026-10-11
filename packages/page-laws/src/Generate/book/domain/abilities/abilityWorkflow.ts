// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** JSON invocation contract shared by Concept-to-Ability generation. */
export interface AbilityWorkflowRunOptions {
  maxOutputTokens?: number;
  repairContext?: string;
  validationCycles?: number;
}

export type AbilityWorkflowJsonRunner = <T>(prompt: string, parse: (content: string) => T, options?: AbilityWorkflowRunOptions) => Promise<T>;
