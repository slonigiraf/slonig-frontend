import { blake2AsHex } from '@polkadot/util-crypto';
import {
  Lesson,
  LetterTemplate,
  TutorAction,
  getLesson,
  getLetterTemplate,
  putLesson,
  putLetterTemplate,
  putRepetition,
} from '@slonigiraf/db';

export interface AiSkillQuestion {
  question: string;
  answer: string;
  questionImageCid?: string;
  answerImageCid?: string;
}

export interface AiSkill {
  id: string;
  cid: string;
  title: string;
  description?: string;
  questions: AiSkillQuestion[];
}

export function aiLessonId(moduleId: string, student: string): string {
  return blake2AsHex(`ai-tutor:${moduleId}:${student}`);
}

export async function createAiLesson(moduleId: string, cid: string, student: string, skills: AiSkill[]): Promise<Lesson> {
  const id = aiLessonId(moduleId, student);
  const existing = await getLesson(id);
  if (existing) return existing;

  const now = Date.now();
  const lesson: Lesson = {
    id,
    created: now,
    cid,
    tutor: student,
    student,
    toLearnCount: skills.length,
    learnStep: 0,
    toReexamineCount: 0,
    reexamineStep: 0,
    dPrice: '0',
    dWarranty: '0',
    dValidity: 0,
    isPaid: false,
    lastAction: undefined,
  };
  await putLesson(lesson);

  await Promise.all(skills.map((skill, stage): Promise<string> => putLetterTemplate({
    stage,
    valid: false,
    mature: false,
    toRepeat: false,
    penalizedTime: undefined,
    lastExamined: now,
    lesson: id,
    knowledgeId: skill.id,
    cid: skill.cid,
    genesis: '',
    letterId: -1,
    block: '',
    worker: student,
    amount: '0',
    privSign: '',
    pubSign: '',
  })));

  return lesson;
}

export async function resetAiLesson(moduleId: string, cid: string, student: string, skills: AiSkill[]): Promise<void> {
  const id = aiLessonId(moduleId, student);
  const existing = await getLesson(id);
  if (!existing) return;

  const now = Date.now();
  await putLesson({
    ...existing,
    cid,
    toLearnCount: skills.length,
    learnStep: 0,
    lastAction: undefined,
  });

  await Promise.all(skills.map(async (skill, stage) => {
    const template = await getLetterTemplate(id, stage);
    if (!template) return;

    await putLetterTemplate({
      ...template,
      valid: false,
      mature: false,
      toRepeat: false,
      penalizedTime: undefined,
      lastExamined: now,
      knowledgeId: skill.id,
      cid: skill.cid,
    });
  }));
}

export async function saveAiDecision(
  lesson: Lesson,
  stage: number,
  action: Extract<TutorAction, 'skip' | 'mark_for_repeat_crude'> = 'mark_for_repeat_crude',
): Promise<Lesson> {
  const template = await getLetterTemplate(lesson.id, stage);
  const now = Date.now();
  if (template) {
    await putLetterTemplate({ ...template, valid: false, toRepeat: true, lastExamined: now });

    // AI Tutor has no remote lesson-result exchange, so persist the repetition
    // locally at the moment the skill is finished. View skills reads this table
    // to decide whether to show the to-repeat badge. A skipped skill should not
    // create a repetition record.
    if (action === 'mark_for_repeat_crude') {
      await putRepetition({
        lastExamined: now,
        workerId: lesson.student,
        knowledgeId: template.knowledgeId,
      });
    }
  }

  const updated: Lesson = {
    ...lesson,
    learnStep: Math.min(lesson.toLearnCount, lesson.learnStep + 1),
    lastAction: action,
  };
  await putLesson(updated);
  return updated;
}
