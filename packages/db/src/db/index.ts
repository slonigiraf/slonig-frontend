import type { Table, Transaction } from 'dexie';

import Dexie from 'dexie';
import { Agreement } from './Agreement.js';
import { CanceledInsurance } from './CanceledInsurance.js';
import { CanceledLetter } from './CanceledLetter.js';
import { CIDCache } from './CIDCache.js';
import { Insurance } from './Insurance.js';
import { Lesson } from './Lesson.js';
import { Letter } from './Letter.js';
import { LetterTemplate } from './LetterTemplate.js';
import { Pseudonym } from './Pseudonym.js';
import { Reexamination } from './Reexamination.js';
import { Reimbursement } from './Reimbursement.js';
import { Setting } from './Setting.js';
import { Signer } from './Signer.js';
import { UsageRight } from './UsageRight.js';
import { Ability } from './Ability.js';
import { Repetition } from './Repetition.js';
import { LearnRequest } from './LearnRequest.js';
import { ScheduledEvent } from './ScheduledEvent.js';
import type { Book } from './Book.js';
import type { BookPage } from './BookPage.js';
import type { BookConcept } from './BookConcept.js';
import type { BookChapter } from './BookChapter.js';
import type { Exercise } from './Exercise.js';
import type { Skill } from './Skill.js';
import type { ExerciseTemplate } from './ExerciseTemplate.js';

type LegacyBookSkill = Omit<Skill, 'exerciseIds'> & { bookExerciseIds?: number[] };
type LegacyExerciseTemplate = Omit<ExerciseTemplate, 'skillId'> & { bookSkillId: number };

class SlonigDB extends Dexie {
  agreements!: Table<Agreement>;
  canceledInsurances!: Table<CanceledInsurance>;
  canceledLetters!: Table<CanceledLetter>;
  cidCache!: Table<CIDCache>;
  insurances!: Table<Insurance>;
  lessons!: Table<Lesson>;
  letters!: Table<Letter>;
  letterTemplates!: Table<LetterTemplate>;
  pseudonyms!: Table<Pseudonym>;
  reexams!: Table<Reexamination>;
  reimbursements!: Table<Reimbursement>;
  settings!: Table<Setting>;
  signers!: Table<Signer>;
  usageRights!: Table<UsageRight>;
  abilities!: Table<Ability>;
  repetitions!: Table<Repetition>;
  learnRequests!:Table<LearnRequest>;
  scheduledEvents!:Table<ScheduledEvent>;
  books!: Table<Book, number>;
  bookPages!: Table<BookPage, [number, number]>;
  bookConcepts!: Table<BookConcept, number>;
  bookChapters!: Table<BookChapter, number>;
  exercises!: Table<Exercise, number>;
  skills!: Table<Skill, number>;
  exerciseTemplates!: Table<ExerciseTemplate, number>;

  constructor() {
    super('slonig');
    this.version(65).stores({
      agreements: '&id',
      canceledInsurances: '&workerSign',
      canceledLetters: '&pubSign',
      cidCache: '&cid,time',
      insurances: '&workerSign,created,workerId,[employer+workerId],[referee+letterId]',
      lessons: '&id,created,tutor,deadline',
      letters: '&pubSign,created,workerId,knowledgeId,[workerId+knowledgeId],[referee+letterId]',
      letterTemplates: '&[cid+lesson],[lesson+stage],lesson,letterId,penalizedTime',
      pseudonyms: '&publicKey',
      reexaminations: null,
      reexams: '&[pubSign+lesson],lesson',
      reimbursements: '&workerSign,referee,[referee+letterId]',
      settings: '&id',
      signers: '&publicKey',
      usageRights: '&[pubSign+employer],[referee+letterId]',
      skillTemplates: '&id,moduleId',
      repetitions: '&[workerId+knowledgeId],lastExamined',
      learnRequests:'&id,created',
      scheduledEvents: '++id,type,[type+id]',
      books: '&id,name,created',
    });
    this.version(66).stores({
      books: null,
    });
    this.version(67).stores({
      books: '++id,name,created',
      bookPages: '&[bookId+pageNumber],bookId,conceptsProcessed',
    });
    this.version(68).stores({
      books: '++id,name,created,&contentHash',
    });
    this.version(69).stores({
      bookPages: '&[bookId+pageNumber],bookId,conceptsProcessed',
      concepts: '++id,bookPage',
    });
    this.version(70).stores({
      bookChapters: '++id,bookId',
    });
    this.version(71).stores({
      bookExercises: '++id,bookPage'
    });
    this.version(72).stores({
      bookChapters: '++id,bookId',
      bookExercises: '++id,bookPage',
      concepts: '++id,bookPage,chapterId'
    }).upgrade(async (transaction) => {
      await Promise.all([
        transaction.table('bookChapters').clear(),
        transaction.table('bookExercises').clear(),
        transaction.table('concepts').clear()
      ]);
    });
    // These book-learning tables are intentionally recreated while the feature
    // is in development. This also completes the concepts -> bookConcepts rename.
    this.version(73).stores({
      bookChapters: '++id,bookId',
      bookConcepts: '++id,bookPage,chapterId',
      bookExercises: '++id,bookPage',
      concepts: null,
      skills: '++id,chapterId'
    }).upgrade(async (transaction) => {
      await Promise.all([
        transaction.table('bookChapters').clear(),
        transaction.table('bookConcepts').clear(),
        transaction.table('bookExercises').clear(),
        transaction.table('skills').clear()
      ]);
    });
    this.version(74).stores({
      skills: '++id,chapterId,rank,[chapterId+rank]'
    }).upgrade(async (transaction: Transaction) => {
      const skills = await transaction.table<LegacyBookSkill>('skills').toArray();
      const chapterRanks = new Map<number, number>();

      await Promise.all(skills
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
        .map((skill) => {
          const rank = chapterRanks.get(skill.chapterId) ?? 0;

          chapterRanks.set(skill.chapterId, rank + 1);

          return transaction.table<LegacyBookSkill>('skills').update(skill.id, { rank });
        }));
    });
    this.version(75).stores({
      bookSkills: '++id,chapterId,rank,[chapterId+rank]',
      exerciseTemplates: '++id,bookSkillId'
    }).upgrade(async (transaction: Transaction) => {
      const existingSkills = await transaction.table<LegacyBookSkill>('skills').toArray();

      if (existingSkills.length) {
        await transaction.table<LegacyBookSkill>('bookSkills').bulkPut(existingSkills);
      }
    });
    this.version(76).stores({
      skills: null
    });
    this.version(77).stores({}).upgrade(async (transaction: Transaction) => {
      const pagesWithoutChapter = await transaction.table<BookPage>('bookPages').filter(({ chapter }) => !chapter.trim()).toArray();

      for (const page of pagesWithoutChapter.sort((a, b) => a.bookId - b.bookId || a.pageNumber - b.pageNumber)) {
        const [concepts, exerciseCount] = await Promise.all([
          transaction.table<BookConcept>('bookConcepts').where('bookPage').equals([page.bookId, page.pageNumber]).toArray(),
          transaction.table<Exercise>('bookExercises').where('bookPage').equals([page.bookId, page.pageNumber]).count()
        ]);

        if (!concepts.length && !exerciseCount) {
          continue;
        }

        const previousPage = (await transaction.table<BookPage>('bookPages').where('bookId').equals(page.bookId)
          .filter((candidate) => candidate.pageNumber < page.pageNumber && Boolean(candidate.chapter.trim()))
          .toArray())
          .sort((a, b) => b.pageNumber - a.pageNumber)[0];
        const chapterTitle = previousPage?.chapter.trim() || 'Introduction';
        const chapters = transaction.table<BookChapter, number>('bookChapters');
        const existingChapter = await chapters.where('bookId').equals(page.bookId).filter(({ title }) => title === chapterTitle).first();
        const chapterId = existingChapter?.id ?? await chapters.add({ bookId: page.bookId, title: chapterTitle });

        await transaction.table<BookPage>('bookPages').update([page.bookId, page.pageNumber], { chapter: chapterTitle });
        await Promise.all(concepts.flatMap(({ id }) => id === undefined ? [] : [transaction.table<BookConcept>('bookConcepts').update(id, { chapterId })]));
      }
    });
    this.version(78).stores({}).upgrade(async (transaction: Transaction) => {
      const books = await transaction.table<Book>('books').filter(({ processingStage }) => (processingStage ?? 0) >= 6).toArray();

      await Promise.all(books.flatMap(({ id }) => id === undefined ? [] : [transaction.table<Book>('books').update(id, { processingStage: 5 })]));
    });
    this.version(79).stores({}).upgrade(async (transaction: Transaction) => {
      const [books, skills] = await Promise.all([
        transaction.table<Book>('books').filter(({ processingStage }) => (processingStage ?? 0) >= 6).toArray(),
        transaction.table<LegacyBookSkill>('bookSkills').toArray()
      ]);

      await Promise.all([
        ...books.flatMap(({ id }) => id === undefined ? [] : [transaction.table<Book>('books').update(id, { processingStage: 5 })]),
        ...skills.flatMap((skill) => skill.id === undefined ? [] : [transaction.table<LegacyBookSkill>('bookSkills').update(skill.id, {
          bookConceptIds: skill.bookConceptIds ?? [],
          bookExerciseIds: skill.bookExerciseIds ?? []
        })])
      ]);
    });
    this.version(80).stores({}).upgrade(async (transaction: Transaction) => {
      const table = transaction.table<ExerciseTemplate & { title?: string }, number>('exerciseTemplates');
      const templates = await table.toArray();

      await Promise.all(templates.map((template) => {
        const { title: _title, ...withoutTitle } = template;

        return table.put(withoutTitle as ExerciseTemplate);
      }));
    });
    this.version(81).stores({
      abilities: '&id,moduleId',
      exercises: '++id,bookPage',
      exerciseTemplates: '++id,skillId',
      skills: '++id,chapterId,rank,[chapterId+rank]'
    }).upgrade(async (transaction: Transaction) => {
      const [legacyAbilities, legacyExercises, legacySkills, legacyTemplates] = await Promise.all([
        transaction.table<Ability>('skillTemplates').toArray(),
        transaction.table<Exercise>('bookExercises').toArray(),
        transaction.table<LegacyBookSkill>('bookSkills').toArray(),
        transaction.table<LegacyExerciseTemplate>('exerciseTemplates').toArray()
      ]);
      const skills = legacySkills.map(({ bookExerciseIds, ...skill }) => ({ ...skill, exerciseIds: bookExerciseIds ?? [] }));
      const templates = legacyTemplates.map(({ bookSkillId, ...template }) => ({ ...template, skillId: bookSkillId }));

      await Promise.all([
        legacyAbilities.length ? transaction.table<Ability>('abilities').bulkPut(legacyAbilities) : Promise.resolve(),
        legacyExercises.length ? transaction.table<Exercise>('exercises').bulkPut(legacyExercises) : Promise.resolve(),
        skills.length ? transaction.table<Skill>('skills').bulkPut(skills) : Promise.resolve(),
        templates.length ? transaction.table<ExerciseTemplate>('exerciseTemplates').bulkPut(templates) : Promise.resolve()
      ]);
    });
    this.version(82).stores({
      bookExercises: null,
      bookSkills: null,
      skillTemplates: null
    });
    this.version(83).stores({}).upgrade(async (transaction: Transaction) => {
      const [books, exercises] = await Promise.all([
        transaction.table<Book>('books').filter(({ processingStage }) => (processingStage ?? 0) >= 3).toArray(),
        transaction.table<Exercise>('exercises').toArray()
      ]);

      await Promise.all([
        ...books.flatMap(({ id, processingStage }) => id === undefined ? [] : [transaction.table<Book>('books').update(id, { processingStage: Math.min(7, (processingStage ?? 2) + 1) })]),
        ...exercises.flatMap((exercise) => exercise.id === undefined || exercise.source ? [] : [transaction.table<Exercise>('exercises').update(exercise.id, { source: 'book' })])
      ]);
    });
  }
}

export const db = new SlonigDB();
