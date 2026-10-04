// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { LawType } from '@slonigiraf/slonig-components';

import { bookModulePublishJson, finalBookCourseJson, initialBookCourseJson } from './bookPublishing.js';

describe('book publishing knowledge relationships', (): void => {
  const courseId = `0x${'11'.repeat(32)}`;
  const moduleId = `0x${'22'.repeat(32)}`;
  const skillId = `0x${'33'.repeat(32)}`;

  it('publishes a new course before its modules with an empty module list', (): void => {
    expect(initialBookCourseJson(courseId, 'Course')).toEqual({
      e: [],
      h: 'Course',
      i: courseId,
      t: LawType.COURSE
    });
  });

  it('publishes each module with the course knowledge id as its parent', (): void => {
    expect(bookModulePublishJson({ courseId, moduleId, skillIds: [skillId], title: 'Module' })).toEqual({
      e: [skillId],
      h: 'Module',
      i: moduleId,
      p: courseId,
      t: LawType.MODULE
    });
  });

  it('adds module ids to the course only after module publishing is prepared', (): void => {
    expect(finalBookCourseJson(courseId, 'Course', [moduleId], { e: [], h: 'Old title', i: courseId, t: LawType.COURSE })).toEqual({
      e: [moduleId],
      h: 'Course',
      i: courseId,
      t: LawType.COURSE
    });
  });
});
