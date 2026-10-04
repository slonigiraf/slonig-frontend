// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { clearAiTutorGeneratedStageTexts, clearAiTutorStudentMessages, clearAiTutorTutorStageMessages, deleteAiTutorStudentMessage, getAiTutorGeneratedStageText, getAiTutorStudentMessage, getAiTutorTutorStageMessage, putAiTutorCurrentStageType, putAiTutorGeneratedStageText, putAiTutorStudentExercise, putAiTutorStudentMessage, putAiTutorTutorStageMessage, putAiTutorVisualDraft, putAiTutorWrongAnswerReasoning } from './index.js';

interface Message {
  text: string;
  tikz?: string;
  tikzDataUrl?: string;
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
    assert.equal(stored?.message?.text, 'First answer');
    assert.deepEqual(stored?.studentExerciseMedia, [{ name: 'diagram.png' }]);

    await deleteAiTutorStudentMessage(lessonId, 0);
    assert.equal(await getAiTutorStudentMessage<Message, Media>(lessonId, 0), undefined);

    await clearAiTutorStudentMessages(lessonId);
    assert.equal(await getAiTutorStudentMessage<Message, Media>(lessonId, 1), undefined);
  });

  it('persists uploaded visual drafts and generated TikZ stage text in IndexedDB', async (): Promise<void> => {
    const visualDraft = {
      attachments: [{
        id: 'upload-1',
        name: 'student-diagram.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,c3R1ZGVudC1pbWFnZQ==',
        kind: 'image'
      }],
      tikz: '\\begin{tikzpicture}\\draw (0,0)--(1,0);\\end{tikzpicture}',
      tikzDataUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%3Epreview%3C%2Fsvg%3E'
    };
    const generated = 'AI reply\n\\begin{tikzpicture}\\draw (0,0) circle (1);\\end{tikzpicture}';

    await putAiTutorVisualDraft(lessonId, 2, visualDraft);
    await putAiTutorGeneratedStageText(lessonId, 2, 'correct_fake_solution', generated);

    const stored = await getAiTutorStudentMessage<Message, Media, typeof visualDraft>(lessonId, 2);

    assert.deepEqual(stored?.visualDraft, visualDraft);
    assert.equal(await getAiTutorGeneratedStageText(lessonId, 2, 'correct_fake_solution'), generated);

    const submittedTikz = '\\begin{tikzpicture}\\draw (0,0)--(2,0);\\end{tikzpicture}';
    const submittedTikzDataUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';
    await putAiTutorStudentMessage<Message, Media>(lessonId, 2, {
      text: 'Submitted answer',
      tikz: submittedTikz,
      tikzDataUrl: submittedTikzDataUrl
    }, [{ name: 'diagram.png' }]);
    const submitted = await getAiTutorStudentMessage<Message, Media, typeof visualDraft>(lessonId, 2);

    assert.equal(submitted?.visualDraft, undefined);
    assert.equal(submitted?.message?.text, 'Submitted answer');
    assert.equal(submitted?.message?.tikz, submittedTikz);
    assert.equal(submitted?.message?.tikzDataUrl, submittedTikzDataUrl);
    assert.equal(await getAiTutorGeneratedStageText(lessonId, 2, 'correct_fake_solution'), generated);

    await clearAiTutorGeneratedStageTexts(lessonId, 2, ['correct_fake_solution']);
    assert.equal(await getAiTutorGeneratedStageText(lessonId, 2, 'correct_fake_solution'), undefined);
  });

  it('persists and clears the learner-facing wrong-answer reasoning', async (): Promise<void> => {
    const reasoning = {
      stageType: 'ask_to_repeat_example_solution',
      text: 'The response used the wrong operation. Add the two terms instead.',
      locale: 'en',
    };

    await putAiTutorWrongAnswerReasoning(lessonId, 4, reasoning);
    await putAiTutorStudentMessage<Message, Media>(lessonId, 4, { text: 'Retry answer' }, []);
    const stored = await getAiTutorStudentMessage<Message, Media>(lessonId, 4);
    assert.equal(stored?.message?.text, 'Retry answer');
    assert.deepEqual(stored?.wrongAnswerReasoning, reasoning);

    await putAiTutorWrongAnswerReasoning(lessonId, 4, undefined);
    const cleared = await getAiTutorStudentMessage<Message, Media>(lessonId, 4);
    assert.equal(cleared?.wrongAnswerReasoning, undefined);
  });

  it('persists the displayed AI message, rendered TikZ, and resume context together with the student message', async (): Promise<void> => {
    const stageType = 'correct_fake_solution';
    const studentTikz = '\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}';
    const aiTikz = '\\begin{tikzpicture}\\draw (0,0) circle (1);\\end{tikzpicture}';
    const tutorMessage = {
      text: `Correct.\n${aiTikz}`,
      tikzPreviews: {
        [aiTikz]: { src: 'data:image/svg+xml;charset=utf-8,%3Csvg%3Eai%3C%2Fsvg%3E' }
      }
    };

    const studentTikzDataUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%3Estudent%3C%2Fsvg%3E';
    await putAiTutorStudentMessage<Message, Media>(lessonId, 3, {
      text: 'Student answer',
      tikz: studentTikz,
      tikzDataUrl: studentTikzDataUrl
    }, []);
    await putAiTutorStudentExercise(lessonId, 3, `Student TikZ drawing:\n${studentTikz}`);
    await putAiTutorCurrentStageType(lessonId, 3, stageType);
    await putAiTutorTutorStageMessage(lessonId, 3, stageType, tutorMessage);

    const stored = await getAiTutorStudentMessage<Message, Media, unknown, typeof tutorMessage>(lessonId, 3);

    assert.equal(stored?.message?.tikz, studentTikz);
    assert.equal(stored?.message?.tikzDataUrl, studentTikzDataUrl);
    assert.equal(stored?.studentExercise, `Student TikZ drawing:\n${studentTikz}`);
    assert.equal(stored?.currentTutorStageType, stageType);
    assert.deepEqual(stored?.tutorStageMessages?.[stageType], tutorMessage);
    assert.deepEqual(await getAiTutorTutorStageMessage(lessonId, 3, stageType), tutorMessage);

    const updatedTutorMessage = {
      text: `Updated.\n${aiTikz}`,
      tikzPreviews: {
        [aiTikz]: { src: 'data:image/svg+xml;charset=utf-8,%3Csvg%3Eai-updated%3C%2Fsvg%3E' }
      }
    };
    await putAiTutorTutorStageMessage(lessonId, 3, stageType, updatedTutorMessage);
    const afterTutorUpdate = await getAiTutorStudentMessage<Message, Media, unknown, typeof updatedTutorMessage>(lessonId, 3);
    assert.equal(afterTutorUpdate?.message?.tikzDataUrl, studentTikzDataUrl);
    assert.deepEqual(afterTutorUpdate?.tutorStageMessages?.[stageType], updatedTutorMessage);

    await putAiTutorStudentMessage<Message, Media>(lessonId, 3, {
      text: 'Student answer',
      tikz: studentTikz,
      tikzDataUrl: studentTikzDataUrl
    }, []);
    const afterStudentUpdate = await getAiTutorStudentMessage<Message, Media, unknown, typeof updatedTutorMessage>(lessonId, 3);
    assert.equal(afterStudentUpdate?.message?.tikzDataUrl, studentTikzDataUrl);
    assert.deepEqual(afterStudentUpdate?.tutorStageMessages?.[stageType], updatedTutorMessage);

    await clearAiTutorTutorStageMessages(lessonId, 3, [stageType]);
    assert.equal(await getAiTutorTutorStageMessage(lessonId, 3, stageType), undefined);
  });
});
