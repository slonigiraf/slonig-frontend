// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { LawType } from '@slonigiraf/slonig-components';

export interface BookModulePublishJsonInput {
  courseId: string;
  moduleId: string;
  skillIds: string[];
  standards?: string;
  title: string;
}

export function initialBookCourseJson (courseId: string, title: string): Record<string, unknown> {
  return {
    e: [],
    h: title,
    i: courseId,
    t: LawType.COURSE
  };
}

export function bookModulePublishJson ({ courseId, moduleId, skillIds, standards, title }: BookModulePublishJsonInput): Record<string, unknown> {
  return {
    e: skillIds,
    h: title,
    i: moduleId,
    p: courseId,
    ...(standards ? { s: standards } : {}),
    t: LawType.MODULE
  };
}

export function finalBookCourseJson (courseId: string, title: string, moduleIds: string[], existing?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(existing || {}),
    e: moduleIds,
    h: title,
    i: courseId,
    t: LawType.COURSE
  };
}
