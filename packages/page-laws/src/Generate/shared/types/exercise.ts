// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';

export type ExerciseEditableFields = Pick<Exercise, 'description' | 'imageDescription' | 'solution' | 'solutionImageDescription' | 'title'>;
