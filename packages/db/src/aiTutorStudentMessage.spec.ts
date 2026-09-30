// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { clearAiTutorStudentMessages, deleteAiTutorStudentMessage, getAiTutorStudentMessage, putAiTutorStudentMessage } from './index.js';

interface Message {
  text: string;
}

interface Media {
  name: string;
}

describe('AI tutor student message persistence', (): void => {
  const lessonId = `ai-tutor-persistence-${Date.now()}`;

  afterEach(async (): Promise<void> => {
    await clearAiTutorStudentMessages(lessonId);
  });

  it('stores, reads, deletes, and clears messages in the Slonig database', async (): Promise<void> => {
    await putAiTutorStudentMessage<Message, Media>(lessonId, 0, { text: 'First answer' }, [{ name: 'diagram.png' }]);
    await putAiTutorStudentMessage<Message, Media>(lessonId, 1, { text: 'Second answer' }, []);

    const stored = await getAiTutorStudentMessage<Message, Media>(lessonId, 0);

    assert.equal(stored?.lessonId, lessonId);
    assert.equal(stored?.lessonStep, 0);
    assert.equal(stored?.message.text, 'First answer');
    assert.deepEqual(stored?.studentExerciseMedia, [{ name: 'diagram.png' }]);

    await deleteAiTutorStudentMessage(lessonId, 0);
    assert.equal(await getAiTutorStudentMessage<Message, Media>(lessonId, 0), undefined);

    await clearAiTutorStudentMessages(lessonId);
    assert.equal(await getAiTutorStudentMessage<Message, Media>(lessonId, 1), undefined);
  });
});
