import { Dexie, type Table, type Transaction } from 'dexie';
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
import type { Image } from './Image.js';
import { Repetition } from './Repetition.js';
import { LearnRequest } from './LearnRequest.js';
import { ScheduledEvent } from './ScheduledEvent.js';
import { BOOK_PROCESSING_STAGES, getBookCompletedStages, withBookProcessingStagesResetFrom } from './Book.js';
import type { Book, BookProcessingStageKey } from './Book.js';
import type { BookPage } from './BookPage.js';
import type { BookConcept } from './BookConcept.js';
import type { BookChapter } from './BookChapter.js';
import type { Exercise } from './Exercise.js';
import type { Skill } from './Skill.js';
import type { ExerciseTemplate } from './ExerciseTemplate.js';
import type { AiTutorStudentMessage } from './AiTutorStudentMessage.js';
import type { StandardEmbedding } from './StandardEmbedding.js';
import type { ConceptEmbedding } from './ConceptEmbedding.js';
import type { MathpixPdfJob } from './MathpixPdfJob.js';
import type { TikzSvgCacheEntry } from './TikzSvgCache.js';
import type { BookProcessingRun } from './BookProcessingRun.js';

type LegacyBookSkill = Omit<Skill, 'exerciseIds'> & { bookExerciseIds?: number[] };
type LegacyExerciseTemplate = Omit<ExerciseTemplate, 'skillId'> & { bookSkillId: number };
type LegacyExerciseWithImages = Exercise & { image?: string; images?: string[] };
type LegacyExerciseWithAbilityMode = Exercise & { abilityMode?: string };

// Upgrade callbacks run inside one IndexedDB transaction. Keep each read/write
// group deliberately small so a large production database does not create a
// correspondingly large array of records or pending requests in memory.
const MIGRATION_BATCH_SIZE = 50;

async function forEachMigrationBatch<T> (table: Table<T>, callback: (rows: T[]) => Promise<void>): Promise<void> {
  let offset = 0;

  while (true) {
    const rows = await table.orderBy(':id').offset(offset).limit(MIGRATION_BATCH_SIZE).toArray();

    if (!rows.length) {
      return;
    }

    await callback(rows);
    offset += rows.length;

    if (rows.length < MIGRATION_BATCH_SIZE) {
      return;
    }
  }
}

export class SlonigDB extends Dexie {
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
  images!: Table<Image, number>;
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
  aiTutorStudentMessages!: Table<AiTutorStudentMessage, string>;
  standardEmbeddings!: Table<StandardEmbedding, string>;
  conceptEmbeddings!: Table<ConceptEmbedding, number>;
  mathpixPdfJobs!: Table<MathpixPdfJob, [number, number, number]>;
  tikzSvgCache!: Table<TikzSvgCacheEntry, [string, string]>;
  bookProcessingRuns!: Table<BookProcessingRun, number>;

  constructor(name = 'slonig') {
    super(name);
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
      await forEachMigrationBatch(transaction.table<Ability>('skillTemplates'), async (rows) => {
        await transaction.table<Ability>('abilities').bulkPut(rows);
      });
      await forEachMigrationBatch(transaction.table<Exercise>('bookExercises'), async (rows) => {
        await transaction.table<Exercise>('exercises').bulkPut(rows);
      });
      await forEachMigrationBatch(transaction.table<LegacyBookSkill>('bookSkills'), async (rows) => {
        const skills = rows.map(({ bookExerciseIds, ...skill }) => ({ ...skill, exerciseIds: bookExerciseIds ?? [] }));

        await transaction.table<Skill>('skills').bulkPut(skills);
      });
      await forEachMigrationBatch(transaction.table<LegacyExerciseTemplate>('exerciseTemplates'), async (rows) => {
        const templates = rows.map(({ bookSkillId, ...template }) => ({ ...template, skillId: bookSkillId }));

        await transaction.table<ExerciseTemplate>('exerciseTemplates').bulkPut(templates);
      });
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
    this.version(84).stores({}).upgrade(async (transaction: Transaction) => {
      // Exercise image bytes are intentionally not persisted. Exercises keep only
      // imageDescription and solutionImageDescription as semantic descriptions of
      // task-essential and worked-solution visuals. Ability generation materializes
      // those visuals later and stores them on the Ability until publishing.
      const table = transaction.table<LegacyExerciseWithImages, number>('exercises');
      const exercises = await table.toArray();

      await Promise.all(exercises.map((exercise) => {
        const { image: _image, images: _images, ...withoutImages } = exercise;
        const description = withoutImages.description
          .replace(/!\[[^\]]*\]\s*\(\s*(?:<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/gi, ' ')
          .replace(/[ \t]{2,}/g, ' ')
          .trim();

        return table.put({ ...withoutImages, description } as LegacyExerciseWithImages);
      }));
    });
    this.version(85).stores({
      bookPages: '&[bookId+pageNumber],bookId,chapterId,conceptsProcessed'
    }).upgrade(async (transaction: Transaction) => {
      const [books, chapters, pages] = await Promise.all([
        transaction.table<Book>('books').toArray(),
        transaction.table<BookChapter>('bookChapters').toArray(),
        transaction.table<BookPage>('bookPages').toArray()
      ]);
      const chaptersByBookAndTitle = new Map(chapters.flatMap((chapter) => chapter.id === undefined ? [] : [[`${chapter.bookId}:${chapter.title.trim().toLocaleLowerCase()}`, chapter.id] as const]));

      await Promise.all([
        ...books.flatMap(({ id, processingStage }) => id === undefined || (processingStage ?? 0) < 2 ? [] : [transaction.table<Book>('books').update(id, { processingStage: (processingStage ?? 0) + 1 })]),
        ...pages.map((page) => {
          if (page.chapterId !== undefined || !page.chapter.trim()) {
            return Promise.resolve(0);
          }

          const chapterId = chaptersByBookAndTitle.get(`${page.bookId}:${page.chapter.trim().toLocaleLowerCase()}`);

          return chapterId === undefined ? Promise.resolve(0) : transaction.table<BookPage>('bookPages').update([page.bookId, page.pageNumber], { chapterId });
        })
      ]);
    });
    this.version(86).stores({}).upgrade(async (transaction: Transaction) => {
      const table = transaction.table<LegacyExerciseWithAbilityMode, number>('exercises');
      const exercises = await table.toArray();

      await Promise.all(exercises.map((exercise) => {
        const { abilityMode: _abilityMode, ...withoutAbilityMode } = exercise;

        return table.put(withoutAbilityMode as LegacyExerciseWithAbilityMode);
      }));
    });
    this.version(87).stores({}).upgrade(async (transaction: Transaction) => {
      const table = transaction.table<Book, number>('books');
      const books = await table.toArray();

      await Promise.all(books.flatMap((book) => book.id === undefined ? [] : [table.update(book.id, { completedStages: getBookCompletedStages(book) })]));
    });
    this.version(88).stores({}).upgrade(async (transaction: Transaction) => {
      const [books, concepts] = await Promise.all([
        transaction.table<Book, number>('books').toArray(),
        transaction.table<BookConcept, number>('bookConcepts').toArray()
      ]);

      await Promise.all([
        ...books.flatMap((book) => book.id === undefined ? [] : [transaction.table<Book, number>('books').update(book.id, { fixConceptsAttempts: book.fixConceptsAttempts ?? 0 })]),
        ...concepts.flatMap((concept) => concept.id === undefined ? [] : [transaction.table<BookConcept, number>('bookConcepts').update(concept.id, { attempt: concept.attempt ?? 0 })])
      ]);
    });

    this.version(89).stores({
      images: '++id,type'
    }).upgrade(async (transaction: Transaction) => {
      const abilities = transaction.table<Ability>('abilities');
      const images = transaction.table<Image, number>('images');
      const isTikz = (value: string): boolean => /\\begin\s*\{tikzpicture\}/.test(value);

      await forEachMigrationBatch(abilities, async (rows) => {
        for (const row of rows) {
          let parsed: unknown;

          try {
            parsed = JSON.parse(row.content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim());
          } catch {
            continue;
          }

          const root = Array.isArray(parsed) ? parsed[0] : parsed;

          if (!root || typeof root !== 'object' || !Array.isArray((root as { q?: unknown }).q)) {
            continue;
          }

          for (const exercise of (root as { q: unknown[] }).q) {
            if (!exercise || typeof exercise !== 'object') {
              continue;
            }

            const value = exercise as Record<string, unknown>;

            for (const field of ['p', 'i'] as const) {
              const visual = value[field];
              const errorField = field === 'p' ? 'pError' : 'iError';
              const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
              const storedPrompt = typeof value[promptField] === 'string' ? (value[promptField] as string).trim() : '';
              const valid = typeof value[errorField] === 'boolean' ? !(value[errorField] as boolean) : undefined;
              let image: Omit<Image, 'id'> | undefined;

              if (typeof visual === 'string' && visual.trim()) {
                const tikz = isTikz(visual);

                image = {
                  data: tikz ? visual : null,
                  prompt: storedPrompt || (tikz ? '' : visual),
                  type: tikz ? 'tikz' : 'prompt',
                  valid
                };
              } else if (storedPrompt) {
                image = { data: null, prompt: storedPrompt, type: 'prompt', valid };
              }

              if (image) {
                value[field] = await images.add(image as Image);
              } else if (typeof visual !== 'number') {
                value[field] = null;
              }

              delete value[errorField];
              delete value[promptField];
            }
          }

          await abilities.update(row.id, { content: JSON.stringify(parsed) });
        }
      });
    });

    // Compatibility migration for databases that briefly used Image.svg and
    // discarded pPrompt/iPrompt in version 89 during development.
    this.version(90).stores({}).upgrade(async (transaction: Transaction) => {
      type LegacyImage = Partial<Image> & { id: number; svg?: string | null };
      const images = transaction.table<LegacyImage, number>('images');

      await forEachMigrationBatch(images, async (rows) => {
        const migrated = rows.map((image): Image => {
          const type = image.type === 'tikz' ? 'tikz' as const : 'prompt' as const;
          const legacyData = image.data ?? image.svg ?? null;
          const prompt = image.prompt ?? (type === 'prompt' ? legacyData ?? '' : '');

          return {
            data: type === 'prompt' && legacyData === prompt ? null : legacyData,
            id: image.id,
            prompt,
            type,
            valid: image.valid
          };
        });

        await images.bulkPut(migrated);
      });
    });

    // Prompt-only images created by the first normalized Image implementation
    // duplicated their semantic prompt into data. Keep the prompt only in
    // Image.prompt; Image.data stays null until visual generation succeeds.
    this.version(91).stores({}).upgrade(async (transaction: Transaction) => {
      const images = transaction.table<Image, number>('images');

      await forEachMigrationBatch(images, async (rows) => {
        await Promise.all(rows.flatMap((image) => image.type === 'prompt' && image.data === image.prompt
          ? [images.update(image.id, { data: null })]
          : []));
      });
    });

    // Persist the ZPD-derived order through the complete learning entity chain.
    // Concepts already carry displayOrder; derive dense chapter-local ranks for
    // Exercises and then Abilities so existing databases immediately render in
    // the same order as newly generated content.
    this.version(92).stores({
      abilities: '&id,moduleId,displayOrder',
      exercises: '++id,bookPage,displayOrder'
    }).upgrade(async (transaction: Transaction) => {
      const conceptsTable = transaction.table<BookConcept, number>('bookConcepts');
      const exercisesTable = transaction.table<Exercise, number>('exercises');
      const abilitiesTable = transaction.table<Ability, string>('abilities');
      const pagesTable = transaction.table<BookPage, [number, number]>('bookPages');
      const [concepts, exercises, pages] = await Promise.all([
        conceptsTable.toArray(),
        exercisesTable.toArray(),
        pagesTable.toArray()
      ]);
      const finiteOrder = (value: number | undefined): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      const conceptById = new Map(concepts.flatMap((concept) => concept.id === undefined ? [] : [[concept.id, concept] as const]));
      const pageChapter = new Map(pages.flatMap(({ bookId, chapterId, pageNumber }) => chapterId === undefined ? [] : [[`${bookId}:${pageNumber}`, chapterId] as const]));
      const chapterIds = new Set<number>([
        ...concepts.flatMap(({ chapterId }) => chapterId === undefined ? [] : [chapterId]),
        ...pages.flatMap(({ chapterId }) => chapterId === undefined ? [] : [chapterId])
      ]);
      const abilitiesByExerciseId = new Map<number, Ability[]>();

      // A version-64 production database has no book-learning rows. Avoid
      // reading every migrated legacy ability when there is nothing to order.
      if (!chapterIds.size) {
        return;
      }

      const abilities = await abilitiesTable.toArray();

      for (const ability of abilities) {
        const match = /^book-(\d+)-exercise-(\d+)$/.exec(ability.moduleId);
        const exerciseId = match ? Number(match[2]) : NaN;

        if (!Number.isSafeInteger(exerciseId)) {
          continue;
        }

        const rows = abilitiesByExerciseId.get(exerciseId) ?? [];

        rows.push(ability);
        abilitiesByExerciseId.set(exerciseId, rows);
      }

      for (const chapterId of chapterIds) {
        const chapterConcepts = concepts
          .filter((concept) => concept.chapterId === chapterId)
          .sort((a, b) => {
            const aOrder = finiteOrder(a.displayOrder);
            const bOrder = finiteOrder(b.displayOrder);

            if (aOrder !== undefined || bOrder !== undefined) {
              if (aOrder === undefined) return 1;
              if (bOrder === undefined) return -1;
              if (aOrder !== bOrder) return aOrder - bOrder;
            }

            return a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
          });
        const conceptRanks = new Map(chapterConcepts.flatMap((concept, rank) => concept.id === undefined ? [] : [[concept.id, rank] as const]));
        const chapterExercises = exercises
          .filter((exercise) => {
            const conceptChapterId = exercise.conceptId === undefined ? undefined : conceptById.get(exercise.conceptId)?.chapterId;

            return conceptChapterId === chapterId || pageChapter.get(`${exercise.bookPage[0]}:${exercise.bookPage[1]}`) === chapterId;
          })
          .sort((a, b) => {
            const aRank = a.conceptId === undefined ? undefined : conceptRanks.get(a.conceptId);
            const bRank = b.conceptId === undefined ? undefined : conceptRanks.get(b.conceptId);

            if (aRank !== undefined || bRank !== undefined) {
              if (aRank === undefined) return 1;
              if (bRank === undefined) return -1;
              if (aRank !== bRank) return aRank - bRank;
            }

            return a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
          });
        let abilityRank = 0;

        for (let exerciseRank = 0; exerciseRank < chapterExercises.length; exerciseRank++) {
          const exercise = chapterExercises[exerciseRank];

          if (exercise.id === undefined) {
            continue;
          }

          await exercisesTable.update(exercise.id, { displayOrder: exerciseRank });

          const exerciseAbilities = [...(abilitiesByExerciseId.get(exercise.id) ?? [])].sort((a, b) => {
            const aOrder = finiteOrder(a.displayOrder);
            const bOrder = finiteOrder(b.displayOrder);

            if (aOrder !== undefined || bOrder !== undefined) {
              if (aOrder === undefined) return 1;
              if (bOrder === undefined) return -1;
              if (aOrder !== bOrder) return aOrder - bOrder;
            }

            return a.id.localeCompare(b.id);
          });

          for (const ability of exerciseAbilities) {
            await abilitiesTable.update(ability.id, { displayOrder: abilityRank++ });
          }
        }
      }
    });

    this.version(93).stores({
      aiTutorStudentMessages: '&key,lessonId'
    });
    this.version(94).stores({
      standardEmbeddings: '&id'
    });
    this.version(95).stores({
      conceptEmbeddings: '&id,bookId'
    });
    // Embedding cache validity is model-specific. Keep model on each row so a
    // model change for one book cannot invalidate vectors belonging to another
    // book, and so Standards/Concept vectors can be checked against the exact
    // model that produced them rather than a single global cache switch.
    this.version(96).stores({
      conceptEmbeddings: '&id,bookId,model',
      standardEmbeddings: '&id,model'
    });
    // Keep in-flight Mathpix PDF ids across reloads. Recognition is performed
    // in deterministic page slices, so the compound range key identifies the
    // one remote job that can be resumed for that slice.
    this.version(97).stores({
      mathpixPdfJobs: '&[bookId+startPage+endPage],bookId,pdfId'
    });
    // TikZ SVGs are regenerable: start with an empty cache and never import
    // previews from the old standalone renderer-version IndexedDB databases.
    this.version(98).stores({
      tikzSvgCache: '&[rendererId+source],updatedAt'
    });
    this.version(99).stores({
      bookProcessingRuns: '&bookId,status,updatedAt'
    });
    // Version 99 was previously used to add processing-run checkpoints.
    // Give visual QA its own version so both migrations run for new and
    // existing databases. A successful SVG render was never a PNG review.
    this.version(100).stores({}).upgrade(async (transaction: Transaction) => {
      const books = transaction.table<Book, number>('books');
      const runs = transaction.table<BookProcessingRun, number>('bookProcessingRuns');
      const fixImagesIndex = BOOK_PROCESSING_STAGES.indexOf('fixImages');
      const requiresVisualQa = (stage: BookProcessingStageKey): boolean =>
        BOOK_PROCESSING_STAGES.indexOf(stage as typeof BOOK_PROCESSING_STAGES[number]) >= fixImagesIndex;

      await forEachMigrationBatch(books, async (rows) => {
        for (const book of rows) {
          if (getBookCompletedStages(book).some(requiresVisualQa)) {
            const reset = withBookProcessingStagesResetFrom(book, 'fixImages');

            await books.update(book.id, { completedStages: reset.completedStages });
          }
        }
      });

      // A persisted Fast Forward run must not claim downstream completion
      // based on old render-only verdicts, even after the Book is reset.
      await forEachMigrationBatch(runs, async (rows) => {
        for (const run of rows) {
          if (run.completed.some(requiresVisualQa)) {
            await runs.update(run.bookId, {
              completed: run.completed.filter((stage) => !requiresVisualQa(stage)),
              status: 'failed',
              currentStage: undefined,
              triggeredStage: undefined,
              startedStage: false,
              error: 'Fix Images now requires PNG-based visual QA. Review the images before restarting Fast Forward.',
              updatedAt: Date.now()
            });
          }
        }
      });
    });

  }
}

export const db = new SlonigDB();
