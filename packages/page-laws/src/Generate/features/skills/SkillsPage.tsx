// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookPage, BookProcessingStageKey, BookStageSpendKey, Exercise, Skill, TikzReviewResult } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../abilities/abilities.js';
import type { AbilityWorkflowJsonRunner, ExerciseAbilityConversion } from '../../book/domain/abilities/abilityWorkflow.js';
import type { AiAction, BookPageContent, ChapterContent, DuplicateAbilityReview, DuplicateExerciseReview, ExerciseFixReviewResult, FixedImageReview, FixReviewResult, ImageFixReviewResult, UnresolvedImageReview, PipelineAction, SkillSource, SkillsProps, SkillsView } from './SkillsTypes.js';

import { addBookStageSpend, completeBookProcessingStage, deleteAbilities, deleteAbility, deleteBookConcept, deleteExercise, getAbilities, getBookChapters, getBookCompletedStages, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, getSkillsForChapter, getImage, getBookVisualQaSummary, hydrateAbilityContent, putImage, setTikzImageQaState, tikzSourceVersion, replaceAbilities, replaceExercisesForConcept, replaceExercisesForBookPage, replaceSkillsForChapter, resetBookProcessingStagesFrom, SettingKey, storeAbility, uncompleteBookProcessingStage } from '@slonigiraf/db';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { TikzPreRenderResult } from '../../../Edit/TikzDisplay.js';
import { isTikzCode } from '../../../Edit/tikz.js';
import { shouldSkipStoredTikzCompile } from '../../../Edit/tikzValidation.js';
import { rasterizeTikzSvg } from '../../book/application/abilities/tikzRaster.js';
import { parseStoredAbility } from '../../../abilities/abilities.js';
import { buildAbilityEmbeddingValidationHints } from '../../book/application/abilities/abilityEmbeddingValidation.js';
import { parseExerciseRepairResult } from '../../book/domain/exercises/exercises.js';
import { processExtractedChapterContent } from '../../book/application/processing/bookProcessing.js';
import { bookProcessingManager } from '../../book/application/pipeline/bookProcessingManager.js';
import { useBookProcessingRun } from '../../book/application/pipeline/useBookProcessingRun.js';
import { bookLanguageLabel } from '../../book/domain/metadata/bookLanguage.js';
import { conceptRedoStagesFrom, type ConceptRedoStage } from './conceptRedoStages.js';
import { addBookExternalCall } from '../../book/infrastructure/storage/bookExternalCalls.js';
import { estimateAiInput } from '../../book/application/pricing/aiEstimate.js';
import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_EMBEDDER } from '../../book/application/config.js';
import { ABILITY_WORKFLOW_SYSTEM_PROMPT, CONCEPT_ABILITY_WORKFLOW_SYSTEM_PROMPT, FIX_ABILITIES_REQUEST_PROMPT, FIX_EXERCISES_REQUEST_PROMPT, REPAIR_SYSTEM_PROMPT, SKILLS_GENERATION_SYSTEM_PROMPT, SOURCES_TO_SKILLS_REQUEST_PROMPT } from '../../book/infrastructure/ai/prompts/abilities.js';
import { abilityGenerationRequestPrompt, generateExerciseAbility, transportCompactAbilitySourceExercise } from '../../book/domain/abilities/abilityWorkflow.js';
import { conceptAbilityGenerationPrompt, generateConceptAbility } from '../../book/domain/abilities/conceptAbilityWorkflow.js';
import { mapConcurrent } from '../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY } from '../../../openrouter/concurrency.js';
import { useBookStageTimer } from '../../book/infrastructure/storage/bookStageTime.js';
import { stripMarkdownImageReferences } from '../../book/infrastructure/pdf/bookImageRefs.js';
import { abilityWithConceptTitle, exerciseWithConceptTitle } from '../../book/domain/concepts/conceptTitles.js';
import { sortAbilitiesForDisplay, sortExercisesForDisplay } from '../../book/domain/concepts/learningOrder.js';
import { resolveSharedChapterIndex } from '../../book/domain/chapters/chapterSelection.js';
import { getSharedChapterSelection, storeSharedChapterSelection, subscribeSharedChapterSelection } from '../../book/infrastructure/storage/chapterSelectionStorage.js';
import { abilityModuleId, abilityRepairInput, abilityWithImageDescriptions, cleanTikzResponse, conceptAbilityModuleId, exerciseAbilityModuleId, exerciseForPageReplacement, exerciseRepairInput, parseGeneratedSkills, parseTikzAiReview, requestAbilityRepairResult, requestChatContent, requestChatContentWithTruncationRetry, requestValidatedJson, storedAbilityImageId, tikzCompileRepairPrompt, tikzDetectedProblemsRepairPrompt, tikzFixReviewPrompt, tikzRequestPrompt, type ImageFixTarget, type StoredAbility, type TikzAiReview } from '../../book/application/abilities/abilityProcessing.js';
import type { ExerciseEditableFields } from '../../shared/types/exercise.js';
import { ChapterTitleEditor } from './components/SkillsComponents.js';
import SkillsContentView from './components/SkillsContentView.js';
import SkillsControls from './components/SkillsControls.js';
import SkillsReviewModals from './components/SkillsReviewModals.js';
import { StyledSkills } from './SkillsStyles.js';

async function preRenderTikzLazy (value: string): Promise<TikzPreRenderResult> {
  const { preRenderTikz } = await import('../../../Edit/TikzDisplay.js');

  return preRenderTikz(value);
}

function skippedInvalidTikzPreRender (): TikzPreRenderResult {
  return {
    compiled: false,
    diagnostics: ['Skipped TikZ Editor pre-render because this unchanged Image is already marked valid:false. Edit the TikZ data to retry.'],
    renderedSvg: '',
    texInput: ''
  };
}

async function preRenderStoredTikz (imageId: number, value: string, forceCompile = false): Promise<TikzPreRenderResult> {
  const image = await getImage(imageId);

  if (!image) {
    throw new Error(`Image ${imageId} was not found while validating TikZ.`);
  }

  // Image.valid belongs to the exact data currently stored in the row. Normal
  // previews may suppress a deterministic unchanged failure, while an explicit
  // Fix images review force-retries it so legacy/transient false flags can heal.
  if (!forceCompile && shouldSkipStoredTikzCompile(image.data, image.valid, value)) {
    return skippedInvalidTikzPreRender();
  }

  const result = await preRenderTikzLazy(value);

  // The Ability list may refresh while a parallel render is running. Never stamp
  // a result onto newer TikZ data that replaced the source we actually tested.
  // Transient renderer failures (timeouts/load failures) are deliberately not
  // persisted as valid:false: doing so made temporary infrastructure failures
  // permanently suppress unchanged TikZ until the user edited the source.
  const currentImage = await getImage(imageId);

  if (currentImage && currentImage.data === value) {
    const nextValid = result.compiled ? true : result.retryable ? undefined : false;
    const nextRenderStatus = result.compiled ? 'passed' : result.retryable ? currentImage.renderStatus ?? 'pending' : 'failed';
    const nextVisualQaStatus = !result.compiled && !result.retryable ? 'failed' : currentImage.visualQaStatus ?? 'pending';
    const nextIssues = !result.compiled && !result.retryable ? result.diagnostics : currentImage.detectedIssues ?? [];

    if (currentImage.renderStatus !== nextRenderStatus || currentImage.visualQaStatus !== nextVisualQaStatus || (nextValid !== undefined && currentImage.valid !== nextValid)) {
      await putImage({ ...currentImage, valid: nextValid ?? currentImage.valid,
        renderStatus: nextRenderStatus, visualQaStatus: nextVisualQaStatus, detectedIssues: nextIssues }, value);
    }
  }

  return result;
}

async function reviewConceptImage (target: ImageFixTarget, client: OpenAI, model: string, language: string, age: number | undefined, onCost: (cost: number) => void, signal: AbortSignal): Promise<{ renderFailure: boolean; item?: FixedImageReview; unresolved?: UnresolvedImageReview }> {
  const originalPreRender = await preRenderStoredTikz(target.imageId, target.originalTikz, true);
  const originalVersion = tikzSourceVersion(target.originalTikz);
  const role = target.field === 'p' ? 'question' : 'solution';
  const regenerateFromSpecification = async (source: string): Promise<string> => {
    const visualPrompt = target.prompt || `Create the required ${role} visual for this exercise from the exercise text and correct answer.`;
    const content = await requestChatContent(
      client, model,
      'You regenerate educational diagrams as compact, browser-renderable TikZ. Return only one TikZ picture block.',
      tikzRequestPrompt(language, target.ability, target.exerciseIndex, target.field, visualPrompt, age),
      false, onCost, 4_000, signal
    );
    const proposal = cleanTikzResponse(content);

    if (proposal.trim() === source.trim()) {
      throw new Error('TikZ regeneration repeated the rejected candidate without fixing it.');
    }

    return proposal;
  };

  let source = target.originalTikz;
  let preRender = originalPreRender;
  let detectedIssues: string[] = [];
  let renderFailure = !originalPreRender.compiled;
  let originalReviewed = false;

  const recordOriginalState = async (renderStatus: 'passed' | 'failed', visualQaStatus: 'passed' | 'failed', issues: string[], reviewResult?: TikzReviewResult): Promise<void> => {
    const updated = await setTikzImageQaState(target.imageId, target.originalTikz, { renderStatus, visualQaStatus, detectedIssues: issues, reviewResult });

    if (!updated) {
      throw new Error('TikZ source changed during review. Discarding the stale review result.');
    }
  };

  const unresolved = async (errors: string[]): Promise<{ renderFailure: boolean; unresolved: UnresolvedImageReview }> => {
    const issues = Array.from(new Set(errors.filter(Boolean)));

    if (!originalReviewed) {
      await recordOriginalState(originalPreRender.compiled ? 'passed' : 'failed', 'failed', issues);
    }

    return { renderFailure, unresolved: {
      imageId: target.imageId, errors: issues, exerciseIndex: target.exerciseIndex,
      field: target.field, originalTikz: target.originalTikz, originalCompiled: originalPreRender.compiled,
      abilityTitle: target.ability.h, exerciseTitle: target.ability.q[target.exerciseIndex]?.h ?? ''
    } };
  };

  try {
    // Maximum three candidate versions. Every source that passes rendering is
    // rasterized and sent through a NEW vision-model request. Never accept a
    // correction just because it produced SVG (or because a previous PNG passed).
    for (let attempt = 1; attempt <= MAX_TIKZ_VISUAL_REVIEW_ATTEMPTS; attempt++) {
      if (signal.aborted) {
        throw new DOMException('TikZ review cancelled.', 'AbortError');
      }

      if (!preRender.compiled) {
        renderFailure = true;
        detectedIssues = [...detectedIssues, ...preRender.diagnostics.map((detail) => `TikZ renderer: ${detail}`)];

        if (source === target.originalTikz) {
          await recordOriginalState('failed', 'failed', detectedIssues);
          originalReviewed = true;
        }

        if (attempt === MAX_TIKZ_VISUAL_REVIEW_ATTEMPTS) {
          return unresolved([...detectedIssues, 'The last candidate did not render.']);
        }

        const repair = await requestValidatedJson(
          client, model,
          'Repair TikZ that failed the real TikZ Editor rendering. Return only JSON.',
          tikzCompileRepairPrompt(language, target, { hasErrors: true, errors: detectedIssues, tikz: source }, preRender, age),
          parseTikzAiReview, true, onCost, TIKZ_REVIEW_MAX_OUTPUT_TOKENS, undefined, 2, signal
        );
        source = repair.tikz.trim() !== source.trim() ? repair.tikz : await regenerateFromSpecification(source);
        preRender = await preRenderTikzLazy(source);
        continue;
      }

      // This throws when a browser cannot decode/draw the actual SVG; there is
      // deliberately NO SVG-text or SVG-data-URL fallback for the AI reviewer.
      const png = await rasterizeTikzSvg(preRender.renderedSvg);
      const reviewTarget = { ...target, originalTikz: source };
      const review = await requestValidatedJson(
        client, model,
        'You are a strict educational diagram QA reviewer and TikZ repair expert. Inspect the ATTACHED PNG, not just the TikZ text. Return only JSON.',
        tikzFixReviewPrompt(language, reviewTarget, preRender, age),
        parseTikzAiReview, true, onCost, TIKZ_REVIEW_MAX_OUTPUT_TOKENS, undefined, 2, signal, png
      );
      // A reviewer that silently edits a source while claiming it is clean has
      // not approved the changed output. Force another visible review instead.
      const clean = !review.hasErrors && review.tikz.trim() === source.trim();
      const issues = clean ? [] : review.errors.length
        ? review.errors
        : ['Reviewer changed TikZ despite reporting no errors; the new candidate requires separate visual QA.'];
      const reviewResult: TikzReviewResult = {
        sourceVersion: tikzSourceVersion(source),
        hasErrors: !clean,
        errors: issues,
        reviewedAt: Date.now(),
        attempt
      };

      if (source === target.originalTikz) {
        await recordOriginalState('passed', clean ? 'passed' : 'failed', issues, reviewResult);
        originalReviewed = true;
      }

      if (clean) {
        const changed = source.trim() !== target.originalTikz.trim();

        return {
          renderFailure,
          ...(changed ? { item: {
            errors: Array.from(new Set(detectedIssues)),
            exerciseIndex: target.exerciseIndex,
            field: target.field,
            imageId: target.imageId,
            fixedPreRender: preRender,
            fixedTikz: source,
            finalReviewResult: reviewResult,
            originalPreRender,
            originalTikz: target.originalTikz,
            prompt: target.prompt,
            record: target.record
          } } : {})
        };
      }

      detectedIssues.push(...issues);

      if (attempt === MAX_TIKZ_VISUAL_REVIEW_ATTEMPTS) {
        return unresolved([...detectedIssues, 'Visual QA rejected the final reviewed candidate. No unreviewed correction will be applied.']);
      }

      let nextSource = review.tikz;

      if (nextSource.trim() === source.trim()) {
        const repair = await requestValidatedJson(
          client, model,
          'Apply the specific TikZ issues found by visual QA. Return JSON with an actually changed TikZ source.',
          tikzDetectedProblemsRepairPrompt(language, reviewTarget, { ...review, errors: issues, hasErrors: true }, preRender, age),
          parseTikzAiReview, true, onCost, TIKZ_REVIEW_MAX_OUTPUT_TOKENS, undefined, 2, signal
        );
        nextSource = repair.tikz;
      }

      source = nextSource.trim() !== source.trim() ? nextSource : await regenerateFromSpecification(source);
      preRender = await preRenderTikzLazy(source);
    }

    return unresolved([...detectedIssues, 'Visual review attempts exhausted.']);
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }

    return unresolved([...detectedIssues, error instanceof Error ? error.message : String(error)]);
  }
}
const BATCH_SIZE = 5;
const FIX_EXERCISES_STAGE: BookProcessingStageKey = 'fixExercises';
const ABILITIES_STAGE: BookProcessingStageKey = 'abilities';
const FIX_ABILITIES_STAGE: BookProcessingStageKey = 'fixAbilities';
const IMAGES_STAGE: BookProcessingStageKey = 'images';
const FIX_IMAGES_STAGE: BookProcessingStageKey = 'fixImages';
const TIKZ_RENDER_CONCURRENCY = 4;
const TIKZ_REVIEW_MAX_OUTPUT_TOKENS = 6_000;
const MAX_TIKZ_VISUAL_REVIEW_ATTEMPTS = 3;

const chapterSessionKey = (bookId: number, view: SkillsView): string => `knowledge-upload-book-${bookId}-${view}-chapter`;

function getSessionChapter (bookId: number, view: SkillsView): number {
  try {
    const stored = Number(sessionStorage.getItem(chapterSessionKey(bookId, view)));

    return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function Skills ({ autoRunAll = false, autoRunStartKey, autoRunSkipRefineChapters = false, book, externalAutoRunBusy = false, externalRefreshToken = 0, onAction, onAutoRunComplete, onAutoRunProcessingChange, onAutoRunProgressChange, onAbortAutoRun, onBookChange, onContentChange, onEntityCountsChange, onPipelineSelectionChange, pipelineOnly = false, pipelineControls, pipelinePrefix, pipelineSuffix, showPipeline = true, view }: SkillsProps): React.ReactElement {
  const language = book.language ?? '';
  const hasBookLanguage = Boolean(language);
  const hasBookSubject = Boolean(book.subject);
  const [aiAction, setAiAction] = useState<AiAction>();
  const [chapterContent, setChapterContent] = useState<ChapterContent[]>([]);
  const [bookPageContent, setBookPageContent] = useState<BookPageContent[]>([]);
  const [chapterIndex, setChapterIndex] = useState(() => getSessionChapter(book.id, view));
  const [editingChapter, setEditingChapter] = useState<BookChapter>();
  const [error, setError] = useState('');
  const [fixReview, setFixReview] = useState<FixReviewResult | null>(null);
  const [exerciseFixReview, setExerciseFixReview] = useState<ExerciseFixReviewResult | null>(null);
  const [imageFixReview, setImageFixReview] = useState<ImageFixReviewResult | null>(null);
  const [generateOnlyMissingAbilities, setGenerateOnlyMissingAbilities] = useState(false);
  const [generateOnlyMissingImages, setGenerateOnlyMissingImages] = useState(false);
  const [fixOnlyFailedTikz, setFixOnlyFailedTikz] = useState(false);
  const [tikzIssuesByImageId, setTikzIssuesByImageId] = useState<Record<number, string[]>>({});
  const [notice, setNotice] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [openRouterSpent, setOpenRouterSpent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [progressTotal, setProgressTotal] = useState(1);
  const [processingStage, setProcessingStage] = useState<BookStageSpendKey>();
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_PROCESSING_MODEL);
  const effectiveModel = autoRunAll ? DEFAULT_PROCESSING_MODEL : selectedModel;
  const [effectiveCompletedStages, setEffectiveCompletedStages] = useState<BookProcessingStageKey[]>(() => getBookCompletedStages(book));
  const [loadedContentSnapshotKey, setLoadedContentSnapshotKey] = useState('');
  const processingRun = useBookProcessingRun(book.id);
  const autoRunStageKeys = processingRun?.mode === 'fastForward' ? processingRun.stages : [];
  const processingAbortControllerRef = useRef<AbortController | null>(null);
  const abilitiesOutputRef = useRef<HTMLDivElement>(null);
  const chapterContentOutputRef = useRef<HTMLDivElement>(null);
  const pendingChapterFocusRef = useRef(false);
  useBookStageTimer(book.id, processingStage);
  const refresh = useCallback((): void => setRefreshToken((value) => value + 1), []);
  // Fast Forward must not start a content-dependent stage from the previous DB
  // snapshot. Several preceding stages replace rows (and therefore ids) before
  // asking Skills to reload. Track exactly which local/external refresh revision
  // chapterContent represents so the auto-run hand-off can wait for that reload.
  const contentSnapshotKey = `${book.id}:${externalRefreshToken}:${refreshToken}`;
  const isContentSnapshotCurrent = loadedContentSnapshotKey === contentSnapshotKey;
  const refreshContent = useCallback((): void => {
    refresh();
    onContentChange?.();
  }, [onContentChange, refresh]);
  const addOpenRouterCost = useCallback((costUsd: number): void => setOpenRouterSpent((current) => current + costUsd), []);
  const addStageCost = useCallback((stage: BookStageSpendKey, costUsd: number): void => {
    addBookExternalCall(book.id, stage, 'openrouter');
    setOpenRouterSpent((current) => current + costUsd);
    void addBookStageSpend(book.id, stage, costUsd).catch(console.error);
  }, [book.id]);
  const addFixExercisesCost = useCallback((costUsd: number): void => addStageCost('fixExercises', costUsd), [addStageCost]);
  const addAbilitiesCost = useCallback((costUsd: number): void => addStageCost('abilities', costUsd), [addStageCost]);
  const addFixAbilitiesCost = useCallback((costUsd: number): void => addStageCost('fixAbilities', costUsd), [addStageCost]);
  const addImagesCost = useCallback((costUsd: number): void => addStageCost('images', costUsd), [addStageCost]);
  const addFixImagesCost = useCallback((costUsd: number): void => addStageCost('fixImages', costUsd), [addStageCost]);
  const changeChapter = useCallback((index: number): void => {
    const nextIndex = Math.max(0, Math.min(index, Math.max(0, chapterContent.length - 1)));
    const chapter = chapterContent[nextIndex]?.chapter;

    pendingChapterFocusRef.current = true;
    setChapterIndex(nextIndex);

    try {
      sessionStorage.setItem(chapterSessionKey(book.id, view), String(nextIndex));
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }

    storeSharedChapterSelection(book.id, { chapterId: chapter?.id, index: nextIndex, title: chapter?.title });
  }, [book.id, chapterContent, view]);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      const [chapters, pages, pageLessConcepts] = await Promise.all([
        getBookChapters(book.id),
        getBookPages(book.id),
        getBookConceptsForBookPage(book.id, 0)
      ]);
      const pageRows = await Promise.all(pages.map(async (page: BookPage) => {
        const [concepts, exercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, page.pageNumber),
          getExercisesForBookPage([book.id, page.pageNumber])
        ]);

        return { concepts, exercises, page };
      }));
      const result = await Promise.all(chapters.map(async (chapter): Promise<ChapterContent> => {
        const skills = chapter.id === undefined ? [] : await getSkillsForChapter(chapter.id);
        const chapterConcepts = [
          ...pageRows.flatMap(({ concepts, page }) => concepts.filter((concept) => concept.chapterId !== undefined
            ? concept.chapterId === chapter.id
            : page.chapter === chapter.title)),
          ...pageLessConcepts.filter(({ chapterId }) => chapterId !== undefined && chapterId === chapter.id)
        ];
        const chapterConceptIds = new Set(chapterConcepts.flatMap(({ id }) => id === undefined ? [] : [id]));
        const exercises = sortExercisesForDisplay(pageRows.flatMap(({ exercises, page }) => exercises.filter(({ conceptId }) => conceptId !== undefined
          ? chapterConceptIds.has(conceptId)
          : page.chapter === chapter.title)));
        const conceptRecords = (await Promise.all(chapterConcepts.flatMap(({ id }) => id === undefined ? [] : [getAbilities(conceptAbilityModuleId(book.id, id))]))).flat();
        const directConceptIds = new Set(conceptRecords.map(({ moduleId }) => Number(/-concept-(\d+)$/.exec(moduleId)?.[1])));
        const legacyRecords = (await Promise.all(exercises.flatMap(({ id, conceptId }) => id === undefined || (conceptId !== undefined && directConceptIds.has(conceptId)) ? [] : [getAbilities(exerciseAbilityModuleId(book.id, id))]))).flat();
        const records = [...conceptRecords, ...legacyRecords] as Array<{ content: string; displayOrder?: number; id: string; moduleId: string }>;
        const abilities = sortAbilitiesForDisplay(await Promise.all(records.map(async ({ content, displayOrder, id, moduleId }): Promise<StoredAbility> => {
          try {
            const hydratedContent = await hydrateAbilityContent(content);

            return { ability: parseStoredAbility(hydratedContent), content, displayOrder, id, moduleId };
          } catch {
            return { ability: null, content, displayOrder, id, moduleId };
          }
        })));

        return { abilities, chapter, concepts: chapterConcepts, exercises, skills };
      }));

      if (active) {
        const sharedSelection = getSharedChapterSelection(book.id);

        setBookPageContent(pageRows.map(({ exercises, page }) => ({ exercises, page })));
        setChapterContent(result);
        setChapterIndex((current) => sharedSelection
          ? resolveSharedChapterIndex(sharedSelection, result.map(({ chapter }) => chapter))
          : Math.min(current, Math.max(0, result.length - 1)));
        // Set this in the same committed update as chapterContent. A subsequent
        // refresh changes contentSnapshotKey synchronously, making the snapshot
        // stale again until the matching async DB read has finished.
        setLoadedContentSnapshotKey(contentSnapshotKey);
      }
    };

    load().catch(() => active && setError('Unable to load this book’s learning content.'));

    return () => {
      active = false;
    };
  }, [book.id, contentSnapshotKey, externalRefreshToken, refreshToken]);

  const chapters = useMemo(() => chapterContent.map(({ chapter }) => chapter), [chapterContent]);

  useEffect(() => subscribeSharedChapterSelection(book.id, (selection) => {
    setChapterIndex(resolveSharedChapterIndex(selection, chapters));
  }), [book.id, chapters]);

  const current = chapterContent[chapterIndex];
  const openChapterEditor = useCallback((): void => {
    if (current?.chapter.id !== undefined) {
      setEditingChapter(current.chapter);
    }
  }, [current]);
  const closeChapterEditor = useCallback((): void => setEditingChapter(undefined), []);
  useLayoutEffect(() => {
    if (!pendingChapterFocusRef.current || !current) {
      return;
    }

    const output = view === 'preExercisesExercises'
      ? abilitiesOutputRef.current
      : chapterContentOutputRef.current;
    const first = view === 'preExercisesExercises'
      ? output?.querySelector<HTMLElement>('.abilityExerciseCard')
      : output?.querySelector<HTMLElement>('.contentCard');

    if (first && output) {
      pendingChapterFocusRef.current = false;
      // Reset the tab's own scroll position so the heading/context above the
      // first card is visible as well. Then bring the tab itself into view and
      // keep keyboard focus on the first card without pulling the scroll down.
      const scrollContainer = view === 'preExercisesExercises'
        ? output
        : first.closest<HTMLElement>('section');

      scrollContainer?.scrollTo({ behavior: 'smooth', top: 0 });
      output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      first.focus({ preventScroll: true });
    }
  }, [current, view]);

  const allConcepts = useMemo(() => chapterContent.flatMap(({ concepts }) => concepts), [chapterContent]);
  const allSkills = useMemo(() => chapterContent.flatMap(({ skills }) => skills), [chapterContent]);
  const allExercises = useMemo(() => chapterContent.flatMap(({ exercises }) => exercises), [chapterContent]);
  const allBookExercises = useMemo(() => allExercises.filter(({ source }) => source !== 'generated'), [allExercises]);
  const allAbilities = useMemo(() => chapterContent.flatMap(({ abilities }) => abilities), [chapterContent]);
  const abilityModuleIds = useMemo(() => new Set(allAbilities.map(({ moduleId }) => moduleId)), [allAbilities]);
  const exerciseConceptIds = useMemo(() => new Set(allExercises.flatMap(({ conceptId }) => conceptId === undefined ? [] : [conceptId])), [allExercises]);
  const conceptsMissingExercises = useMemo(() => allConcepts.filter(({ id }) => id === undefined || !exerciseConceptIds.has(id)), [allConcepts, exerciseConceptIds]);
  const exercisesMissingAbilities = useMemo(() => allConcepts.filter(({ id }) => id === undefined || !abilityModuleIds.has(conceptAbilityModuleId(book.id, id))), [abilityModuleIds, allConcepts, book.id]);
  const missingAbilityIndexesByChapter = useMemo(() => chapterContent.map(({ concepts }) => concepts.flatMap(({ id }, conceptIndex) => id === undefined || !abilityModuleIds.has(conceptAbilityModuleId(book.id, id)) ? [conceptIndex] : [])), [abilityModuleIds, book.id, chapterContent]);
  const missingAbilityCountsByChapter = useMemo(() => missingAbilityIndexesByChapter.map((indexes) => indexes.length), [missingAbilityIndexesByChapter]);
  const currentMissingAbilityIndexes = missingAbilityIndexesByChapter[chapterIndex] ?? [];
  const focusAbilityExercise = useCallback((exerciseIndex: number): void => {
    const conceptId = current?.concepts[exerciseIndex]?.id;
    const conceptSection = Array.from(abilitiesOutputRef.current?.querySelectorAll<HTMLElement>('[data-concept-id]') ?? [])
      .find((section) => section.dataset.conceptId === String(conceptId))
      ?? abilitiesOutputRef.current?.querySelector<HTMLElement>('.orphanAbilities');

    conceptSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    conceptSection?.focus({ preventScroll: true });
  }, [current]);

  useEffect(() => {
    onEntityCountsChange?.({ abilities: allAbilities.length, bookExercises: allBookExercises.length, exercises: allExercises.length });
  }, [allAbilities.length, allBookExercises.length, allExercises.length, onEntityCountsChange]);
  useEffect(() => {
    if (!exercisesMissingAbilities.length && generateOnlyMissingAbilities) {
      setGenerateOnlyMissingAbilities(false);
    }
  }, [exercisesMissingAbilities.length, generateOnlyMissingAbilities]);
  const exercisesByModuleId = useMemo(() => {
    const lookup = new Map(allExercises.flatMap((exercise) => exercise.id === undefined ? [] : [[exerciseAbilityModuleId(book.id, exercise.id), exercise] as const]));
    for (const concept of allConcepts) {
      if (concept.id !== undefined) lookup.set(conceptAbilityModuleId(book.id, concept.id), {
        bookPage: concept.bookPage, conceptId: concept.id, description: concept.description,
        id: concept.id, solution: '', source: 'generated', title: concept.title
      });
    }
    return lookup;
  }, [allConcepts, allExercises, book.id]);
  const exerciseTitlesByModuleId = useMemo(() => new Map(Array.from(exercisesByModuleId, ([moduleId, exercise]) => [moduleId, exercise.title] as const)), [exercisesByModuleId]);
  const conceptsById = useMemo(() => new Map(chapterContent.flatMap(({ concepts }) => concepts.flatMap((concept) => concept.id === undefined ? [] : [[concept.id, concept] as const]))), [chapterContent]);
  const imageGenerationTargets = useMemo(() => allAbilities.flatMap((record) => record.ability
    ? record.ability.q.flatMap((exercise, exerciseIndex) => (['p', 'i'] as const).flatMap((field) => {
      const value = exercise[field].trim();
      const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
      const storedPrompt = exercise[promptField]?.trim() ?? '';
      // Prompt-only Image rows hydrate with an empty visual value because
      // Image.data is null until generation. Always source generation from the
      // semantic prompt when it exists; keep the old fallback for legacy input.
      const visualPrompt = storedPrompt || (!isTikzCode(value) ? value : '');
      const imageId = storedAbilityImageId(record, exerciseIndex, field);

      return visualPrompt && imageId !== undefined ? [{ exerciseIndex, field, imageId, record, visualPrompt }] : [];
    }))
    : []), [allAbilities]);
  const missingImageGenerationTargets = useMemo(() => imageGenerationTargets.filter(({ exerciseIndex, field, record }) => {
    const value = record.ability?.q[exerciseIndex]?.[field] ?? '';

    return !isTikzCode(value);
  }), [imageGenerationTargets]);
  const abilitiesMissingImages = useMemo(() => new Set(missingImageGenerationTargets.map(({ record }) => record.id)), [missingImageGenerationTargets]);
  const imageGenerationTargetsForRun = generateOnlyMissingImages ? missingImageGenerationTargets : imageGenerationTargets;
  useEffect(() => {
    if (!abilitiesMissingImages.size && generateOnlyMissingImages) {
      setGenerateOnlyMissingImages(false);
    }
  }, [abilitiesMissingImages, generateOnlyMissingImages]);
  const imageFixTargets = useMemo<ImageFixTarget[]>(() => allAbilities.flatMap((record) => record.ability
    ? record.ability.q.flatMap((exercise, exerciseIndex) => (['p', 'i'] as const).flatMap((field) => {
      const value = exercise[field];

      if (!value.trim() || !isTikzCode(value)) {
        return [];
      }

      const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
      const imageId = storedAbilityImageId(record, exerciseIndex, field);

      return imageId === undefined ? [] : [{ ability: record.ability as GeneratedAbility, exerciseIndex, field, imageId, originalTikz: value, prompt: exercise[promptField]?.trim() ?? '', record }];
    }))
    : []), [allAbilities]);
  // These flags are persisted on Image rows and reloaded with the book. They
  // survive a failed stage, refresh, and browser restart; no ephemeral error
  // banner is needed to identify the affected Ability.
  useEffect(() => {
    let active = true;

    Promise.all(imageFixTargets.map(async ({ imageId }) => {
      const image = await getImage(imageId);
      const failed = image?.renderStatus === 'failed' || image?.visualQaStatus === 'failed' || image?.valid === false;

      return { imageId, issues: failed ? image?.detectedIssues?.length ? image.detectedIssues : [`Image ${imageId} failed TikZ QA.`] : [] };
    })).then((entries) => {
      if (active) {
        setTikzIssuesByImageId(Object.fromEntries(entries.filter(({ issues }) => issues.length).map(({ imageId, issues }) => [imageId, issues])));
      }
    }).catch(console.error);

    return () => { active = false; };
  }, [imageFixTargets, contentSnapshotKey]);
  const failedTikzTargets = useMemo(() => imageFixTargets.filter(({ imageId }) => Boolean(tikzIssuesByImageId[imageId]?.length)), [imageFixTargets, tikzIssuesByImageId]);
  const failedTikzAbilityCount = useMemo(() => new Set(failedTikzTargets.map(({ record }) => record.id)).size, [failedTikzTargets]);
  const failedVisualCountsByChapter = useMemo(() => {
    const failedAbilityIds = new Set(failedTikzTargets.map(({ record }) => record.id));

    return chapterContent.map(({ abilities }) => abilities.filter(({ id }) => failedAbilityIds.has(id)).length);
  }, [chapterContent, failedTikzTargets]);
  const imageFixTargetsForRun = fixOnlyFailedTikz && !autoRunAll ? failedTikzTargets : imageFixTargets;
  const skillSources = useMemo<SkillSource[]>(() => chapterContent.flatMap(({ chapter, concepts, exercises }) => chapter.id === undefined ? [] : [...concepts.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'concept' as const, title }]), ...exercises.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description: stripMarkdownImageReferences(description), sourceId: id, sourceType: 'exercise' as const, title }])]), [chapterContent]);
  useEffect(() => {
    setEffectiveCompletedStages(getBookCompletedStages(book));
  }, [book]);

  const [bookVisualQaStatus, setBookVisualQaStatus] = useState<'passed' | 'pending' | 'failed'>('pending');

  useEffect(() => {
    let active = true;

    setBookVisualQaStatus('pending');
    getBookVisualQaSummary(book.id).then(({ status }) => {
      if (active) setBookVisualQaStatus(status);
    }).catch(() => {
      if (active) setBookVisualQaStatus('failed');
    });

    return () => { active = false; };
  }, [book.id, contentSnapshotKey]);

  // A prior render-only checkpoint (including a stale UI book snapshot) is not
  // proof that the current book images passed PNG-based visual inspection.
  const stageDone = useCallback((stage: BookProcessingStageKey): boolean => effectiveCompletedStages.includes(stage), [effectiveCompletedStages]);
  const hasAbilities = allAbilities.length > 0;

  const completeStage = useCallback(async (stage: BookProcessingStageKey, invalidateDownstream = false): Promise<void> => {
    if (invalidateDownstream) {
      await resetBookProcessingStagesFrom(book.id, stage);
    }

    const updated = await completeBookProcessingStage(book.id, stage);
    const completedStages = updated ? getBookCompletedStages(updated) : Array.from(new Set([...effectiveCompletedStages, stage]));
    const nextBook: Book = updated ?? { ...book, completedStages };

    setEffectiveCompletedStages(completedStages);
    onBookChange(nextBook);
  }, [book, effectiveCompletedStages, onBookChange]);

  const createClient = useCallback(async (): Promise<OpenAI> => {
    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      throw new Error('No OpenRouter token found. Add it in Settings.');
    }

    return new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1', dangerouslyAllowBrowser: true, defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' }, maxRetries: 0 });
  }, []);

  const requestInputs = useMemo((): string[] => {
    if (aiAction === 'skills') {
      return Array.from({ length: Math.ceil(skillSources.length / BATCH_SIZE) }, (_, index) => SOURCES_TO_SKILLS_REQUEST_PROMPT(language, skillSources.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE)));
    }

    if (aiAction === 'exercises') {
      return chapterContent.flatMap(({ chapter, concepts }) => concepts
        .filter(({ id }) => !generateOnlyMissingAbilities || id === undefined || !abilityModuleIds.has(conceptAbilityModuleId(book.id, id)))
        .map((concept) => conceptAbilityGenerationPrompt(language, chapter.title, concept, book.age)));
    }

    if (aiAction === 'fixExercises') {
      return chapterContent.filter(({ exercises }) => exercises.length > 0).map(({ chapter, exercises }) => FIX_EXERCISES_REQUEST_PROMPT(exerciseRepairInput(language, exercises, chapter.title, book.age, conceptsById)));
    }

    if (aiAction === 'fix') {
      return chapterContent.filter(({ abilities }) => abilities.length > 0).map(({ abilities, chapter }) => FIX_ABILITIES_REQUEST_PROMPT(abilityRepairInput(language, abilities, chapter.title, book.age, undefined, exercisesByModuleId, conceptsById)));
    }

    if (aiAction === 'images') {
      return imageGenerationTargetsForRun.flatMap(({ exerciseIndex, field, record, visualPrompt }) => record.ability
        ? [tikzRequestPrompt(language, record.ability, exerciseIndex, field, visualPrompt, book.age)]
        : []);
    }

    if (aiAction === 'fixImages') {
      const pendingPreRender: TikzPreRenderResult = { compiled: true, diagnostics: [], renderedSvg: '', texInput: '' };

      return imageFixTargetsForRun.map((target) => tikzFixReviewPrompt(language, target, pendingPreRender, book.age));
    }

    return [];
  }, [abilityModuleIds, aiAction, book.age, book.id, chapterContent, conceptsById, exercisesByModuleId, generateOnlyMissingAbilities, imageFixTargetsForRun, imageGenerationTargetsForRun, language, skillSources]);
  const maxChapterAbilityCount = Math.max(1, ...chapterContent.map(({ abilities }) => abilities.length));
  const maxChapterExerciseCount = Math.max(1, ...chapterContent.map(({ exercises }) => exercises.length));
  const generationOutputTokens = aiAction === 'exercises' ? 3_200 : aiAction === 'fixExercises' ? maxChapterExerciseCount * 550 : aiAction === 'fix' ? maxChapterAbilityCount * 700 : aiAction === 'images' ? 2_400 : aiAction === 'fixImages' ? TIKZ_REVIEW_MAX_OUTPUT_TOKENS : aiAction === 'skills' ? BATCH_SIZE * 180 : 300;
  const validationInputs = requestInputs;
  const outputTokens = generationOutputTokens;
  const estimate = estimateAiInput(effectiveModel, validationInputs, outputTokens);

  const deleteExerciseWithAbilities = useCallback(async (exerciseId: number): Promise<void> => {
    await deleteAbilities(exerciseAbilityModuleId(book.id, exerciseId));
    await deleteExercise(exerciseId);
  }, [book.id]);

  const saveExercise = useCallback(async (exerciseId: number, value: ExerciseEditableFields): Promise<void> => {
    const row = bookPageContent.find(({ exercises }) => exercises.some(({ id }) => id === exerciseId));

    if (!row) {
      throw new Error('Unable to find the page containing this Exercise.');
    }

    const originalExercises = row.exercises;
    const updatedExercises = originalExercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...value } : exercise);
    const abilityContentsByExerciseId = new Map<number, string[]>();

    originalExercises.forEach(({ id }) => {
      if (id !== undefined) {
        abilityContentsByExerciseId.set(id, allAbilities.filter(({ moduleId }) => moduleId === exerciseAbilityModuleId(book.id, id)).map(({ content }) => content));
      }
    });

    await replaceExercisesForBookPage([book.id, row.page.pageNumber], updatedExercises.map(exerciseForPageReplacement));

    const storedExercises = await getExercisesForBookPage([book.id, row.page.pageNumber]);

    if (storedExercises.length !== originalExercises.length || storedExercises.some(({ id }) => id === undefined)) {
      throw new Error('Unable to remap Exercises after saving the edit.');
    }

    for (let index = 0; index < originalExercises.length; index++) {
      const oldId = originalExercises[index].id;
      const newId = storedExercises[index].id as number;

      if (oldId === undefined || oldId === newId) {
        continue;
      }

      const contents = abilityContentsByExerciseId.get(oldId) ?? [];

      if (contents.length) {
        await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
      }

      await deleteAbilities(exerciseAbilityModuleId(book.id, oldId));
    }

    setNotice('Exercise saved. Existing Abilities were kept linked to the edited Exercise.');
    refreshContent();
  }, [allAbilities, book.id, bookPageContent, refreshContent]);

  const fixSingleExercise = useCallback(async (exerciseId: number): Promise<void> => {
    const chapterRow = chapterContent.find(({ exercises }) => exercises.some(({ id }) => id === exerciseId));
    const exercise = chapterRow?.exercises.find(({ id }) => id === exerciseId);

    if (!chapterRow || !exercise) {
      throw new Error('Unable to find this Exercise in its chapter.');
    }

    const client = await createClient();
    const systemPrompt = REPAIR_SYSTEM_PROMPT(language, book.age);
    const userPrompt = FIX_EXERCISES_REQUEST_PROMPT(exerciseRepairInput(language, [exercise], chapterRow.chapter.title, book.age, conceptsById));
    const result = await requestValidatedJson(
      client,
      effectiveModel,
      systemPrompt,
      userPrompt,
      (content) => parseExerciseRepairResult(content, [exercise], [exerciseId]),
      true,
      addFixExercisesCost,
      undefined,
      undefined,
      2
    );
    const review = result.reviews.find(({ index }) => index === 0);

    const corrected = exerciseWithConceptTitle(review?.exercise ?? exercise, conceptsById);

    if (!review?.hasErrors && corrected.title === exercise.title) {
      setNotice('AI review found no Exercise changes to apply.');
      return;
    }

    await saveExercise(exerciseId, {
      description: corrected.description,
      imageDescription: corrected.imageDescription,
      solution: corrected.solution,
      solutionImageDescription: corrected.solutionImageDescription,
      title: corrected.title
    });
    setNotice('Exercise fixed with AI. Existing Abilities were kept linked to the edited Exercise.');
  }, [addFixExercisesCost, book.age, chapterContent, conceptsById, createClient, effectiveModel, language, saveExercise]);

  const deleteConceptWithExercises = useCallback(async (conceptId: number): Promise<void> => {
    const referencedExercises = allExercises.filter(({ conceptId: exerciseConceptId, id }) => id !== undefined && exerciseConceptId === conceptId);

    for (const exercise of referencedExercises) {
      await deleteExerciseWithAbilities(exercise.id as number);
    }

    await deleteBookConcept(conceptId);
  }, [allExercises, deleteExerciseWithAbilities]);

  const beginProgress = useCallback((label: string, total: number, stage?: BookStageSpendKey): AbortSignal => {
    processingAbortControllerRef.current?.abort();
    const controller = new AbortController();

    processingAbortControllerRef.current = controller;
    setProcessingStage(stage);
    setAiAction(undefined); setError(''); setFixReview(null); setExerciseFixReview(null); setImageFixReview(null); setNotice(''); setIsBusy(true); setOpenRouterSpent(0); setProgress(0); setProgressLabel(label); setProgressTotal(Math.max(1, total));

    return controller.signal;
  }, []);

  const endProgress = useCallback((): void => {
    processingAbortControllerRef.current = null;
    setProcessingStage(undefined);
    setIsBusy(false);
  }, []);

  const abortProcessing = useCallback((): void => {
    processingAbortControllerRef.current?.abort();
    processingAbortControllerRef.current = null;
    setProcessingStage(undefined);
    setIsBusy(false);
    setAiAction(undefined);
    setNotice('Processing aborted.');

    if (autoRunAll) {
      onAbortAutoRun?.();
    }
  }, [autoRunAll, onAbortAutoRun]);

  useEffect(() => autoRunAll
    ? bookProcessingManager.registerSkillsAbort(book.id, abortProcessing)
    : undefined, [abortProcessing, autoRunAll, book.id]);

  // The Ability card replays a local slice of the book pipeline, never its
  // chapter-wide actions. Re-read the freshly persisted rows between stages:
  // replacement can change Exercise/Ability IDs and Image references.
  const redoConceptFromStage = useCallback(async (record: StoredAbility, start: ConceptRedoStage): Promise<void> => {
    if (processingAbortControllerRef.current) {
      throw new Error('Another AI operation is currently running.');
    }

    const sourceExercise = exercisesByModuleId.get(record.moduleId);
    const conceptId = sourceExercise?.conceptId ?? Number(/-concept-(\d+)$/.exec(record.moduleId)?.[1]);
    const chapterRow = conceptId === undefined ? undefined : chapterContent.find(({ concepts }) => concepts.some(({ id }) => id === conceptId));
    const concept = chapterRow?.concepts.find(({ id }) => id === conceptId);

    if (!concept || conceptId === undefined || !chapterRow) {
      throw new Error('This Ability has no linked Concept. Link it to a Concept before regenerating.');
    }

    if (!language || !book.subject) {
      throw new Error('Book language and subject must be configured before regenerating a Concept.');
    }

    const stages = conceptRedoStagesFrom(start);
    const signal = beginProgress(`Regenerating Concept: ${concept.title}`, stages.length, start);
    const conceptMap = new Map([[conceptId, concept]]);

    const readAbilities = async (): Promise<StoredAbility[]> => {
      const records = await getAbilities(conceptAbilityModuleId(book.id, conceptId));

      return Promise.all(records.map(async ({ id, content, displayOrder, moduleId }): Promise<StoredAbility> => {
        const hydrated = await hydrateAbilityContent(content);

        return { ability: parseStoredAbility(hydrated), content, displayOrder, id, moduleId };
      }));
    };

    try {
      const client = await createClient();

      for (const [stageIndex, stage] of stages.entries()) {
        if (signal.aborted) throw new Error('Concept regeneration was cancelled.');
        setProcessingStage(stage);
        setProgress(stageIndex);
        setProgressLabel(`${stageIndex + 1}/${stages.length}: ${stage} — ${concept.title}`);

        if (stage === 'abilities') {
          const runJson: AbilityWorkflowJsonRunner = (prompt, parse, options) => requestValidatedJson(
            client, effectiveModel, CONCEPT_ABILITY_WORKFLOW_SYSTEM_PROMPT(language, chapterRow.chapter.title, book.age),
            prompt, parse, true, addAbilitiesCost, options?.maxOutputTokens,
            options?.repairContext, options?.validationCycles ?? 1, signal
          );
          const ability = await generateConceptAbility(language, chapterRow.chapter.title, concept, runJson, book.age);
          if (signal.aborted) throw new Error('Concept regeneration was cancelled.');
          await replaceAbilities(conceptAbilityModuleId(book.id, conceptId), [JSON.stringify(ability)]);
        }

        if (stage === 'fixAbilities') {
          const records = await readAbilities();

          if (!records.length || records.some(({ ability }) => !ability)) throw new Error('No valid Ability exists for this Concept. Start from Create Ability.');
          const moduleExercises = new Map([[conceptAbilityModuleId(book.id, conceptId), exercisesByModuleId.get(conceptAbilityModuleId(book.id, conceptId)) as Exercise]]);
          const result = await requestAbilityRepairResult(
            client, effectiveModel, REPAIR_SYSTEM_PROMPT(language, book.age),
            abilityRepairInput(language, records, chapterRow.chapter.title, book.age, undefined, moduleExercises, conceptMap),
            records, addFixAbilitiesCost, signal
          );

          if (result.unresolvedReviews?.length) throw new Error(`AI could not repair this Concept's Ability: ${result.unresolvedReviews[0].errors.join('; ')}`);
          const duplicateIds = new Set(result.duplicatePairs.map(({ deletedAbilityId }) => deletedAbilityId));
          const fixed = records.flatMap((row, index) => {
            if (duplicateIds.has(row.id)) return [];
            const replacement = result.reviews.find(({ index: reviewIndex }) => reviewIndex === index)?.ability;
            const fixedAbility = abilityWithConceptTitle(replacement ?? row.ability as GeneratedAbility, moduleExercises.get(row.moduleId), conceptMap);
            const validated = parseStoredAbility(JSON.stringify(fixedAbility));

            if (!validated) throw new Error('Ability repair returned an invalid replacement. Nothing was saved.');

            return [{ content: JSON.stringify(validated), moduleId: row.moduleId }];
          });

          const moduleId = conceptAbilityModuleId(book.id, conceptId);
          const contents = fixed.filter((item) => item.moduleId === moduleId).map(({ content }) => content);
          if (!contents.length) throw new Error('Ability repair removed the last Ability for this Concept. Nothing was replaced.');
          if (signal.aborted) throw new Error('Concept regeneration was cancelled.');
          await replaceAbilities(moduleId, contents);
        }

        if (stage === 'images') {
          const records = await readAbilities();

          if (!records.length || records.some(({ ability }) => !ability)) throw new Error('No valid Ability exists for this Concept. Start from Create Ability.');
          const targets = records.flatMap((row) => (row.ability as GeneratedAbility).q.flatMap((exercise, exerciseIndex) => (['p', 'i'] as const).flatMap((field) => {
            const imageId = storedAbilityImageId(row, exerciseIndex, field);
            const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
            const visualPrompt = exercise[promptField]?.trim() || (!isTikzCode(exercise[field]) ? exercise[field].trim() : '');

            return imageId !== undefined && visualPrompt ? [{ ability: row.ability as GeneratedAbility, exerciseIndex, field, imageId, visualPrompt }] : [];
          })));
          await mapConcurrent(targets, OPENROUTER_CONCURRENCY, async ({ ability, exerciseIndex, field, imageId, visualPrompt }) => {
            const response = await requestChatContentWithTruncationRetry(
              client, effectiveModel,
              'You convert precise educational visual specifications into valid, compact TikZ code. Follow the requested output contract exactly.',
              tikzRequestPrompt(language, ability, exerciseIndex, field, visualPrompt, book.age),
              false, addImagesCost, 2_400, signal
            );
            if (signal.aborted) throw new Error('Concept regeneration was cancelled.');
            const image = await getImage(imageId);
            const tikz = cleanTikzResponse(response);

            if (!image) throw new Error(`Image ${imageId} was not found.`);
            if (!isTikzCode(tikz)) throw new Error(`Image generation did not produce TikZ for this Concept (${field} visual).`);
            await putImage({ ...image, data: tikz, prompt: visualPrompt, type: 'tikz', valid: undefined });
          });
        }

        if (stage === 'fixImages') {
          const records = await readAbilities();
          const targets: ImageFixTarget[] = records.flatMap((row) => row.ability
            ? row.ability.q.flatMap((exercise, exerciseIndex) => (['p', 'i'] as const).flatMap((field) => {
              const imageId = storedAbilityImageId(row, exerciseIndex, field);
              const tikz = exercise[field];
              const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';

              return imageId !== undefined && isTikzCode(tikz) ? [{ ability: row.ability as GeneratedAbility, exerciseIndex, field, imageId, originalTikz: tikz, prompt: exercise[promptField]?.trim() ?? '', record: row }] : [];
            }))
            : []);
          if (records.some((row) => row.ability?.q.some((exercise, index) => (['p', 'i'] as const).some((field) => {
            const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';

            return exercise[promptField]?.trim() && (!isTikzCode(exercise[field]) || storedAbilityImageId(row, index, field) === undefined);
          })))) throw new Error('Some visuals have not been generated yet. Start from Generate Images.');
          await mapConcurrent(targets, TIKZ_RENDER_CONCURRENCY, async (target) => {
            const review = await reviewConceptImage(target, client, effectiveModel, language, book.age, addFixImagesCost, signal);

            if (signal.aborted) throw new Error('Concept regeneration was cancelled.');
            if (review.unresolved) {
              throw new Error(`Image ${review.unresolved.imageId} did not pass visual QA: ${review.unresolved.errors.join(' | ')}`);
            }
            if (review.item) {
              const image = await getImage(review.item.imageId);

              if (!image) throw new Error(`Image ${review.item.imageId} was not found.`);
              if (image.data !== review.item.originalTikz) throw new Error('TikZ source changed during review; refusing stale candidate.');
              await putImage({ ...image, data: review.item.fixedTikz, prompt: review.item.prompt || image.prompt, type: 'tikz', valid: true,
                sourceVersion: review.item.finalReviewResult.sourceVersion, renderStatus: 'passed', visualQaStatus: 'passed',
                detectedIssues: [], reviewResult: review.item.finalReviewResult }, review.item.originalTikz);
            }
          });
        }

        setProgress(stageIndex + 1);
      }

      setNotice(`Regenerated Concept “${concept.title}” from ${start} through Fix Images. Other Concepts were not changed.`);
    } finally {
      try {
        refreshContent();
      } finally {
        endProgress();
      }
    }
  }, [addAbilitiesCost, addFixAbilitiesCost, addFixExercisesCost, addFixImagesCost, addImagesCost, addStageCost, beginProgress, book.age, book.id, book.subject, chapterContent, conceptsById, createClient, effectiveModel, endProgress, exercisesByModuleId, language, refreshContent]);

  const generateSkills = useCallback(async (): Promise<void> => {
    const signal = beginProgress('Generating Skills', skillSources.length);

    try {
      const client = await createClient();
      const generatedByChapter = new Map<number, Array<Omit<Skill, 'chapterId' | 'id'>>>();
      const batches = Array.from({ length: Math.ceil(skillSources.length / BATCH_SIZE) }, (_, index) => skillSources.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
      let completed = 0;
      const results = await mapConcurrent(batches, OPENROUTER_CONCURRENCY, async (batch) => {
        const systemPrompt = SKILLS_GENERATION_SYSTEM_PROMPT(language);
        const userPrompt = SOURCES_TO_SKILLS_REQUEST_PROMPT(language, batch);
        const generated = await requestValidatedJson(client, effectiveModel, systemPrompt, userPrompt, (content) => parseGeneratedSkills(content, batch.length), true, addOpenRouterCost, undefined, undefined, 2, signal);

        completed += batch.length;
        setProgress(Math.min(skillSources.length, completed));

        return { batch, generated };
      });

      // mapConcurrent preserves input order, so ranks remain deterministic even
      // when later OpenRouter requests finish before earlier ones.
      for (const { batch, generated } of results) {
        generated.forEach((skill, index) => {
          const rows = generatedByChapter.get(batch[index].chapterId) ?? [];
          const source = batch[index];

          rows.push({
            ...skill,
            bookConceptIds: source.sourceType === 'concept' ? [source.sourceId] : [],
            exerciseIds: source.sourceType === 'exercise' ? [source.sourceId] : [],
            rank: rows.length
          });
          generatedByChapter.set(source.chapterId, rows);
        });
      }

      await Promise.all(allSkills.flatMap(({ id }) => id === undefined ? [] : [deleteAbilities(abilityModuleId(book.id, id))]));
      await Promise.all(chapters.flatMap(({ id }) => id === undefined ? [] : [replaceSkillsForChapter(id, generatedByChapter.get(id) ?? [])]));
      refresh();
    } catch (caught) {
      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Unable to generate Skills.');
      }
    } finally {
      endProgress();
    }
  }, [addOpenRouterCost, allSkills, beginProgress, book.id, endProgress, chapters, createClient, language, refresh, effectiveModel, skillSources]);

  const generateExercises = useCallback(async (): Promise<void> => {
    const targets = generateOnlyMissingAbilities ? exercisesMissingAbilities : allConcepts;
    const signal = beginProgress('Generating Abilities from Concepts', targets.length, 'abilities');

    try {
      if (!allConcepts.length) throw new Error('No Concepts are available to generate Abilities from.');
      if (!targets.length) throw new Error('No Concepts are missing Abilities.');
      if (targets.some(({ id }) => id === undefined)) throw new Error('Every Concept must be saved before generating Abilities.');
      const client = await createClient();
      const pending = new Set(targets.map(({ id }) => id as number));
      const generated = new Map<number, GeneratedAbility>();
      let lastError = '';
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts && pending.size; attempt++) {
        const sources = chapterContent.flatMap(({ chapter, concepts }) => concepts
          .filter(({ id }) => id !== undefined && pending.has(id))
          .map((concept) => ({ chapterTitle: chapter.title, concept })));
        await mapConcurrent(sources, OPENROUTER_CONCURRENCY, async ({ chapterTitle, concept }) => {
          const runJson: AbilityWorkflowJsonRunner = (prompt, parse, options) => requestValidatedJson(
            client, effectiveModel, CONCEPT_ABILITY_WORKFLOW_SYSTEM_PROMPT(language, chapterTitle, book.age),
            prompt, parse, true, addAbilitiesCost,
            options?.maxOutputTokens, options?.repairContext, options?.validationCycles ?? 1, signal
          );
          try {
            const ability = await generateConceptAbility(language, chapterTitle, concept, runJson, book.age);
            generated.set(concept.id as number, ability);
            pending.delete(concept.id as number);
            setProgress(generated.size);
          } catch (reason) {
            if (signal.aborted) throw reason;
            lastError = reason instanceof Error ? reason.message : String(reason);
          }
        });
      }

      for (const [conceptId, ability] of generated) {
        if (signal.aborted) throw new Error('Ability generation was canceled.');
        await replaceAbilities(conceptAbilityModuleId(book.id, conceptId), [JSON.stringify(ability)]);
      }
      if (generated.size || allAbilities.length) await completeStage(ABILITIES_STAGE);
      refresh();
      onContentChange?.();
      if (generated.size || allAbilities.length) onAction?.('preExercisesExercises');
      if (pending.size) {
        const detail = lastError ? ` Last attempt: ${lastError}` : '';
        if (!generated.size && !allAbilities.length) setError(`No Abilities were generated after ${maxAttempts} attempts.${detail}`);
        else setNotice(`Generated Abilities for ${generated.size} of ${targets.length} Concepts; ${pending.size} remained unchanged.${detail}`);
      }
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to generate Abilities.');
    } finally {
      endProgress();
    }
  }, [addAbilitiesCost, allAbilities.length, allConcepts, beginProgress, book.age, book.id, chapterContent, completeStage, createClient, effectiveModel, endProgress, exercisesMissingAbilities, generateOnlyMissingAbilities, language, onAction, onContentChange, refresh]);

  const fixExercises = useCallback(async (): Promise<void> => {
    const signal = beginProgress('Fixing Exercise errors', allExercises.length, 'fixExercises');

    try {
      if (!allExercises.length) {
        throw new Error('No Exercises are available to fix.');
      }

      if (allExercises.some(({ id }) => id === undefined)) {
        throw new Error('Every Exercise must have an id before Exercises can be fixed.');
      }

      const client = await createClient();
      const replacements = new Map<number, { errors: string[]; exercise: Exercise }>();
      const duplicatePairs = new Map<number, DuplicateExerciseReview>();
      const batches = chapterContent
        .filter(({ exercises }) => exercises.length > 0)
        .map(({ chapter, exercises }) => ({ batch: exercises, chapterTitle: chapter.title }));
      let completed = 0;

      await mapConcurrent(batches, OPENROUTER_CONCURRENCY, async ({ batch, chapterTitle }) => {
        const originalIds = batch.map(({ id }) => id as number);
        const systemPrompt = REPAIR_SYSTEM_PROMPT(language, book.age);
        const userPrompt = FIX_EXERCISES_REQUEST_PROMPT(exerciseRepairInput(language, batch, chapterTitle, book.age, conceptsById));
        const result = await requestValidatedJson(
          client,
          effectiveModel,
          systemPrompt,
          userPrompt,
          (content) => parseExerciseRepairResult(content, batch, originalIds),
          true,
          addFixExercisesCost,
          undefined,
          undefined,
          2,
          signal
        );
        const batchDuplicateIds = new Set(result.duplicatePairs.map(({ deletedExerciseId }) => deletedExerciseId));

        result.duplicatePairs.forEach(({ deletedExerciseId, keptExerciseId }) => {
          const kept = batch.find(({ id }) => id === keptExerciseId);
          const deleted = batch.find(({ id }) => id === deletedExerciseId);

          if (!kept || !deleted) {
            throw new Error('OpenRouter returned a duplicate Exercise pair that does not exist in this chapter.');
          }

          duplicatePairs.set(deletedExerciseId, { chapterTitle, deleted, kept });
        });
        result.reviews.forEach((review) => {
          if (review.hasErrors && review.exercise) {
            const original = batch[review.index];
            const id = original.id as number;

            if (!batchDuplicateIds.has(id)) {
              replacements.set(id, { errors: review.errors, exercise: exerciseWithConceptTitle(review.exercise, conceptsById) });
            }
          }
        });
        completed += batch.length;
        setProgress(Math.min(allExercises.length, completed));
      });

      const duplicateIds = new Set(duplicatePairs.keys());

      allExercises.forEach((exercise) => {
        if (exercise.id !== undefined && !duplicateIds.has(exercise.id)) {
          const existing = replacements.get(exercise.id);
          const corrected = exerciseWithConceptTitle(existing?.exercise ?? exercise, conceptsById);

          if (corrected.title !== exercise.title) {
            replacements.set(exercise.id, { errors: [...(existing?.errors ?? []), 'Title must match its source Concept.'], exercise: corrected });
          }
        }
      });
      duplicateIds.forEach((id) => replacements.delete(id));
      const review: ExerciseFixReviewResult = {
        checked: allExercises.length,
        duplicatePairs: Array.from(duplicatePairs.values()),
        items: Array.from(replacements, ([exerciseId, { errors, exercise }]) => ({
          errors,
          exercise,
          exerciseId,
          original: allExercises.find(({ id }) => id === exerciseId) ?? exercise
        }))
      };
      const unchanged = Math.max(0, allExercises.length - replacements.size - duplicateIds.size);

      // This is intentionally only a proposal. The database and processing
      // stage are not touched until the user explicitly accepts the review
      // popup below.
      setExerciseFixReview(review);
      setNotice(`Review ready: ${replacements.size} Exercise fix${replacements.size === 1 ? '' : 'es'}, ${duplicateIds.size} duplicate deletion${duplicateIds.size === 1 ? '' : 's'}, ${unchanged} unchanged. No database changes have been made.`);
    } catch (caught) {
      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Unable to fix Exercise errors.');
      }
    } finally {
      endProgress();
    }
  }, [addFixExercisesCost, allExercises, beginProgress, book.age, endProgress, chapterContent, conceptsById, createClient, language, effectiveModel]);

  const fixAbilities = useCallback(async (): Promise<void> => {
    const signal = beginProgress('Fixing Ability errors', allAbilities.length, 'fixAbilities');

    try {
      const client = await createClient();
      const embeddingModel = await getSetting(SettingKey.CONCEPTS_EMBEDDER) || DEFAULT_STANDARDS_EMBEDDER;

      setProgressLabel('Checking Ability/Exercise alignment');
      const embeddingHints = await buildAbilityEmbeddingValidationHints(
        client,
        embeddingModel,
        allAbilities.map((record) => ({
          ability: record.ability,
          abilityId: record.id,
          exercise: exercisesByModuleId.get(record.moduleId)
        })),
        addFixAbilitiesCost,
        signal
      );

      setProgressLabel('Fixing Ability errors');
      const replacements = new Map<string, { ability: GeneratedAbility; errors: string[]; record: StoredAbility }>();
      const unresolved = new Map<string, { errors: string[]; record: StoredAbility }>();
      const duplicatePairs = new Map<string, DuplicateAbilityReview>();
      // Duplicate detection needs complete chapter context, so every chapter is
      // one AI request. Different chapters may still be reviewed concurrently.
      const batches = chapterContent
        .filter(({ abilities }) => abilities.length > 0)
        .map(({ abilities, chapter }) => ({ batch: abilities, chapterTitle: chapter.title }));
      let completed = 0;

      await mapConcurrent(batches, OPENROUTER_CONCURRENCY, async ({ batch, chapterTitle }) => {
        const systemPrompt = REPAIR_SYSTEM_PROMPT(language, book.age);
        const result = await requestAbilityRepairResult(
          client, effectiveModel, systemPrompt,
          abilityRepairInput(language, batch, chapterTitle, book.age, embeddingHints, exercisesByModuleId, conceptsById),
          batch, addFixAbilitiesCost, signal
        );
        const batchDuplicateIds = new Set(result.duplicatePairs.map(({ deletedAbilityId }) => deletedAbilityId));

        result.unresolvedReviews?.forEach(({ errors, index }) => {
          const record = batch[index];

          if (record && !batchDuplicateIds.has(record.id)) unresolved.set(record.id, { errors, record });
        });

        result.duplicatePairs.forEach(({ deletedAbilityId, keptAbilityId }) => {
          const kept = batch.find(({ id }) => id === keptAbilityId);
          const deleted = batch.find(({ id }) => id === deletedAbilityId);

          if (!kept || !deleted) {
            throw new Error('OpenRouter returned a duplicate Ability pair that does not exist in this chapter.');
          }

          const deletedExercise = exercisesByModuleId.get(deleted.moduleId);
          const deletedConcept = deletedExercise?.conceptId === undefined ? undefined : conceptsById.get(deletedExercise.conceptId);

          duplicatePairs.set(deletedAbilityId, {
            chapterTitle,
            deleted,
            deletedConceptId: deletedExercise?.conceptId,
            deletedConceptTitle: deletedConcept?.title,
            deletedExerciseId: deletedExercise?.id,
            deletedExerciseTitle: deletedExercise?.title,
            kept,
            keptExerciseTitle: exerciseTitlesByModuleId.get(kept.moduleId)
          });
        });
        result.reviews.forEach((review) => {
          if (review.hasErrors && review.ability) {
            const record = batch[review.index];

            // Duplicate copies are deleted after the review phase, so do not
            // spend a write replacing a record that is about to disappear.
            if (!batchDuplicateIds.has(record.id)) {
              replacements.set(record.id, { ability: abilityWithConceptTitle(review.ability, exercisesByModuleId.get(record.moduleId), conceptsById), errors: review.errors, record });
            }
          }
        });
        completed += batch.length;
        setProgress(Math.min(allAbilities.length, completed));
      });

      const duplicateIds = new Set(duplicatePairs.keys());

      allAbilities.forEach((record) => {
        if (record.ability && !duplicateIds.has(record.id)) {
          const existing = replacements.get(record.id);
          const corrected = abilityWithConceptTitle(existing?.ability ?? record.ability, exercisesByModuleId.get(record.moduleId), conceptsById);

          if (corrected.h !== record.ability.h) {
            replacements.set(record.id, { ability: corrected, errors: [...(existing?.errors ?? []), 'Title must match its source Concept.'], record });
          }
        }
      });
      duplicateIds.forEach((id) => {
        replacements.delete(id);
        unresolved.delete(id);
      });

      setFixReview({
        checked: allAbilities.length,
        duplicatePairs: Array.from(duplicatePairs.values(), (pair) => {
          const keptReplacement = replacements.get(pair.kept.id);

          return keptReplacement
            ? { ...pair, kept: { ...pair.kept, ability: keptReplacement.ability, content: JSON.stringify(keptReplacement.ability) } }
            : pair;
        }),
        items: Array.from(replacements.values(), ({ ability, errors, record }) => ({
          ability,
          errors,
          exerciseTitle: exerciseTitlesByModuleId.get(record.moduleId),
          record,
          recordId: record.id
        })),
        unresolved: Array.from(unresolved.values())
      });
      const unchanged = Math.max(0, allAbilities.length - replacements.size - duplicateIds.size - unresolved.size);

      // Keep the review side-effect free. Applying the proposal is a separate,
      // explicit action in the results popup.
      setNotice(`Review ready: ${replacements.size} Ability fix${replacements.size === 1 ? '' : 'es'}, ${duplicateIds.size} duplicate deletion${duplicateIds.size === 1 ? '' : 's'}, ${unchanged} unchanged, ${unresolved.size} unresolved. No database changes have been made.`);
    } catch (caught) {
      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Unable to fix Ability errors.');
      }
    } finally {
      endProgress();
    }
  }, [addFixAbilitiesCost, allAbilities.length, beginProgress, book.age, endProgress, chapterContent, conceptsById, createClient, exerciseTitlesByModuleId, exercisesByModuleId, language, effectiveModel]);

  const closeFixReview = useCallback((): void => {
    setFixReview(null);
    setNotice('Proposed Ability changes were discarded. No database changes were made.');
  }, []);
  const closeExerciseFixReview = useCallback((): void => {
    setExerciseFixReview(null);
    setNotice('Proposed Exercise changes were discarded. No database changes were made.');
  }, []);
  const applyAbilityFixReview = useCallback(async (): Promise<void> => {
    if (!fixReview) {
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const duplicateConceptIds = new Set(fixReview.duplicatePairs.flatMap(({ deletedConceptId }) => deletedConceptId === undefined ? [] : [deletedConceptId]));
      const duplicateExerciseIds = new Set(fixReview.duplicatePairs.flatMap(({ deletedExerciseId }) => deletedExerciseId === undefined ? [] : [deletedExerciseId]));
      let fixed = 0;

      for (const { ability, record } of fixReview.items) {
        const sourceExercise = exercisesByModuleId.get(record.moduleId);

        // Do not rewrite an Ability whose upstream Exercise/Concept is about to
        // be removed by a duplicate cascade.
        if (sourceExercise?.id !== undefined && (duplicateExerciseIds.has(sourceExercise.id) || (sourceExercise.conceptId !== undefined && duplicateConceptIds.has(sourceExercise.conceptId)))) {
          continue;
        }

        const newRecordId = await storeAbility(record.moduleId, JSON.stringify(ability), record.displayOrder);

        if (newRecordId !== record.id) {
          await deleteAbility(record.id);
        }

        fixed += 1;
      }

      // A duplicate Ability represents duplicate upstream learning content. Remove
      // its source Exercise and Concept as one cascade so no orphaned source rows
      // remain. Deleting a Concept also removes every Exercise/Ability linked to it.
      for (const conceptId of duplicateConceptIds) {
        await deleteConceptWithExercises(conceptId);
      }

      // Exercises without a linked Concept still need to disappear with their
      // duplicate Ability. This is a fallback for legacy/unmatched source data.
      for (const exerciseId of duplicateExerciseIds) {
        const exercise = allExercises.find(({ id }) => id === exerciseId);

        if (exercise?.conceptId === undefined) {
          await deleteExerciseWithAbilities(exerciseId);
        }
      }

      // Preserve the old cleanup behavior for an Ability record whose source
      // Exercise can no longer be resolved. Matched records were already removed
      // by the Exercise/Concept cascades above.
      for (const { deleted, deletedExerciseId } of fixReview.duplicatePairs) {
        if (deletedExerciseId === undefined) {
          await deleteAbility(deleted.id);
        }
      }

      const hasChanges = fixReview.items.length > 0 || fixReview.duplicatePairs.length > 0;

      // A no-op diagnosis must never mark the full repair stage complete,
      // even if the stage was marked complete by an earlier run.
      if (fixReview.unresolved.length) {
        if (stageDone(FIX_ABILITIES_STAGE)) await uncompleteBookProcessingStage(book.id, FIX_ABILITIES_STAGE);
      } else if (hasChanges || !stageDone(FIX_ABILITIES_STAGE)) {
        await completeStage(FIX_ABILITIES_STAGE);
      }

      const deleted = fixReview.duplicatePairs.length;

      setFixReview(null);
      setNotice(`Applied Fix abilities review: ${fixed} corrected, ${deleted} duplicate${deleted === 1 ? '' : 's'} deleted with their source Exercise${deleted === 1 ? '' : 's'} and linked Concept${deleted === 1 ? '' : 's'}.${fixReview.unresolved.length ? ` ${fixReview.unresolved.length} problem${fixReview.unresolved.length === 1 ? '' : 's'} remain unresolved; the Fix abilities stage was not marked complete.` : ''}`);
      refresh();
      onContentChange?.();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to apply Fix abilities changes.');
    } finally {
      setIsBusy(false);
    }
  }, [allExercises, book.id, deleteConceptWithExercises, deleteExerciseWithAbilities, exercisesByModuleId, fixReview, onAction, onContentChange, refresh, completeStage, stageDone]);
  const applyExerciseFixReview = useCallback(async (): Promise<void> => {
    if (!exerciseFixReview) {
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const replacements = new Map(exerciseFixReview.items.map(({ exercise, exerciseId }) => [exerciseId, exercise] as const));
      const duplicateIds = new Set(exerciseFixReview.duplicatePairs.flatMap(({ deleted }) => deleted.id === undefined ? [] : [deleted.id]));
      const abilityContentsByExerciseId = new Map<number, string[]>();

      allExercises.forEach(({ id }) => {
        if (id === undefined) {
          return;
        }

        const moduleId = exerciseAbilityModuleId(book.id, id);

        abilityContentsByExerciseId.set(id, allAbilities.filter((record) => record.moduleId === moduleId).map(({ content }) => content));
      });

      for (const { exercises, page } of bookPageContent) {
        const pageHasChanges = exercises.some(({ id }) => id !== undefined && (duplicateIds.has(id) || replacements.has(id)));

        if (!pageHasChanges) {
          continue;
        }

        const keptEntries = exercises
          .filter(({ id }) => id === undefined || !duplicateIds.has(id))
          .map((original) => ({
            corrected: original.id === undefined ? original : replacements.get(original.id) ?? original,
            original
          }));

        await replaceExercisesForBookPage([book.id, page.pageNumber], keptEntries.map(({ corrected }) => exerciseForPageReplacement(corrected)));

        const storedExercises = await getExercisesForBookPage([book.id, page.pageNumber]);

        if (storedExercises.length !== keptEntries.length || storedExercises.some(({ id }) => id === undefined)) {
          throw new Error('Unable to remap Exercises after applying fixes.');
        }

        for (let index = 0; index < keptEntries.length; index++) {
          const oldId = keptEntries[index].original.id;
          const newId = storedExercises[index].id as number;

          if (oldId === undefined) {
            continue;
          }

          const oldModuleId = exerciseAbilityModuleId(book.id, oldId);
          const wasCorrected = replacements.has(oldId);

          if (!wasCorrected && oldId !== newId) {
            const contents = abilityContentsByExerciseId.get(oldId) ?? [];

            if (contents.length) {
              await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
            }
          }

          if (wasCorrected || oldId !== newId) {
            await deleteAbilities(oldModuleId);
          }
        }

        for (const deletedId of exercises.flatMap(({ id }) => id !== undefined && duplicateIds.has(id) ? [id] : [])) {
          await deleteAbilities(exerciseAbilityModuleId(book.id, deletedId));
        }
      }

      const hasChanges = replacements.size > 0 || duplicateIds.size > 0;

      // Content corrections may leave a few downstream rows stale or missing,
      // but preserve their completed-stage history so small edits do not force a
      // full pipeline rerun. Result-completeness checks still expose gaps.
      if (hasChanges || !stageDone(FIX_EXERCISES_STAGE)) {
        await completeStage(FIX_EXERCISES_STAGE);
      }

      const fixed = replacements.size;
      const deleted = duplicateIds.size;

      setExerciseFixReview(null);
      setNotice(`Applied Fix exercises review: ${fixed} corrected, ${deleted} duplicate${deleted === 1 ? '' : 's'} deleted.`);
      refresh();
      onContentChange?.();
      onAction?.('conceptExercises');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to apply Fix exercises changes.');
    } finally {
      setIsBusy(false);
    }
  }, [allAbilities, allExercises, book.id, bookPageContent, exerciseFixReview, onAction, onContentChange, refresh, completeStage, stageDone]);
  const openExerciseGeneration = useCallback((): void => {
    setGenerateOnlyMissingAbilities(exercisesMissingAbilities.length > 0 && exercisesMissingAbilities.length < allConcepts.length);
    setAiAction('exercises');
  }, [allConcepts.length, exercisesMissingAbilities.length]);
  const retryMissingAbilities = useCallback((): void => {
    setGenerateOnlyMissingAbilities(true);
    setAiAction('exercises');
  }, []);
  const openExerciseFix = useCallback((): void => {
    // Opening the confirmation must be a purely local state change. Switching
    // the parent pane here can remount/re-render the surrounding reader before
    // the modal is used, which made this action appear one-shot in some flows.
    // Keep pane navigation deferred until the review popup is explicitly applied.
    setAiAction('fixExercises');
  }, []);
  const openAbilityFix = useCallback((): void => {
    setAiAction('fix');
  }, []);

  const openImages = useCallback((): void => {
    setGenerateOnlyMissingImages(missingImageGenerationTargets.length > 0 && missingImageGenerationTargets.length < imageGenerationTargets.length);
    setAiAction('images');
  }, [imageGenerationTargets.length, missingImageGenerationTargets.length]);
  const retryMissingImages = useCallback((): void => {
    setGenerateOnlyMissingImages(true);
    setAiAction('images');
  }, []);
  const completeImagesStage = useCallback(async (): Promise<void> => {
    const targets = imageGenerationTargetsForRun;
    const signal = beginProgress('Converting visual prompts to TikZ', targets.length, 'images');
    let completed = 0;

    try {
      if (generateOnlyMissingImages && !targets.length) {
        throw new Error('No Abilities are missing Images.');
      }

      if (!targets.length) {
        await completeStage(IMAGES_STAGE, true);
        setNotice('Images complete. There were no visual prompts requiring TikZ conversion or regeneration.');
        return;
      }

      const client = await createClient();

      await mapConcurrent(targets, OPENROUTER_CONCURRENCY, async ({ exerciseIndex, field, imageId, record, visualPrompt }) => {
        if (!record.ability) {
          return;
        }

        const content = await requestChatContentWithTruncationRetry(
          client,
          effectiveModel,
          'You convert precise educational visual specifications into valid, compact TikZ code. Follow the requested output contract exactly.',
          tikzRequestPrompt(language, record.ability, exerciseIndex, field, visualPrompt, book.age),
          false,
          addImagesCost,
          2_400,
          signal
        );
        const tikz = cleanTikzResponse(content);
        const image = await getImage(imageId);

        if (!image) {
          throw new Error(`Image ${imageId} referenced by Ability ${record.id} was not found.`);
        }

        await putImage({ ...image, data: tikz, prompt: visualPrompt, type: 'tikz', valid: undefined });
        completed += 1;
        setProgress(completed);
      });

      await completeStage(IMAGES_STAGE, true);
      setNotice(`Images complete: converted ${targets.length} visual prompt${targets.length === 1 ? '' : 's'} to TikZ${generateOnlyMissingImages ? ` for ${abilitiesMissingImages.size} ${abilitiesMissingImages.size === 1 ? 'Ability' : 'Abilities'} with missing Images` : ''}.`);
      refreshContent();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      if (completed > 0) {
        // Successful requests are persisted one-by-one. Reload them after a
        // partial failure/abort so the missing-images rerun only retries gaps.
        refreshContent();
      }

      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Unable to convert Ability visuals to TikZ.');
      }
    } finally {
      endProgress();
    }
  }, [abilitiesMissingImages.size, addImagesCost, beginProgress, book.age, endProgress, completeStage, createClient, effectiveModel, generateOnlyMissingImages, imageGenerationTargetsForRun, language, onAction, refreshContent]);
  const fixImages = useCallback(async (): Promise<void> => {
    const targets = imageFixTargetsForRun;
    const signal = beginProgress('Reviewing TikZ visuals', targets.length, 'fixImages');

    try {
      if (!targets.length) {
        if (autoRunAll) {
          await completeStage(FIX_IMAGES_STAGE);
          setNotice('Fix images finished: no TikZ visuals needed review.');
          refreshContent();
        } else {
          setImageFixReview({ checked: 0, renderFailures: 0, items: [], unresolved: [] });
          setNotice('There are no TikZ visuals matching this Fix images run.');
        }
        return;
      }

      const client = await createClient();
      let completed = 0;
      const reviewTargets = async (batch: ImageFixTarget[]) => mapConcurrent(batch, TIKZ_RENDER_CONCURRENCY, async (target) => {
        const review = await reviewConceptImage(target, client, effectiveModel, language, book.age, addFixImagesCost, signal);

        completed += 1;
        setProgress(completed);

        return review;
      });
      const reviewResults = await reviewTargets(targets);
      const renderFailures = reviewResults.filter(({ renderFailure }) => renderFailure).length;
      const items = reviewResults.flatMap(({ item }) => item ? [item] : []);
      let unresolved = reviewResults.flatMap(({ unresolved }) => unresolved ? [unresolved] : []);

      if (!autoRunAll) {
        setImageFixReview({ checked: targets.length, renderFailures, items, unresolved });
        const cleanUnchanged = Math.max(0, targets.length - items.length - unresolved.length);

        setNotice(`Fix images QA: ${items.length} PNG-reviewed correction${items.length === 1 ? '' : 's'}, ${cleanUnchanged} approved unchanged, ${unresolved.length} flagged for later retry. No proposed source changes have been applied.`);
        // Display the freshly persisted failures even before the review popup is closed.
        refreshContent();
        return;
      }

      // Fast Forward applies only candidates that passed an actual PNG review.
      // A failed review never applies an unapproved proposed source.
      let changed = 0;
      const applyApproved = async (approved: FixedImageReview[]): Promise<void> => {
        for (const { fixedTikz, finalReviewResult, imageId, originalTikz, prompt } of approved) {
          if (signal.aborted) throw new DOMException('TikZ review cancelled.', 'AbortError');
          const image = await getImage(imageId);

          if (!image || image.data !== originalTikz || finalReviewResult.sourceVersion !== tikzSourceVersion(fixedTikz) || finalReviewResult.hasErrors) {
            throw new Error(`Image ${imageId} changed during its reviewed correction.`);
          }
          await putImage({ ...image, data: fixedTikz, prompt: prompt || image.prompt, type: 'tikz', valid: true,
            sourceVersion: finalReviewResult.sourceVersion, renderStatus: 'passed', visualQaStatus: 'passed',
            detectedIssues: [], reviewResult: finalReviewResult }, originalTikz);
          changed++;
        }
      };

      await applyApproved(items);

      // Immediately after normal Fix images, run one focused pass using ONLY
      // images that failed. Do not waste AI calls on visuals already approved.
      if (unresolved.length) {
        const failedIds = new Set(unresolved.map(({ imageId }) => imageId));
        const retryTargets = targets.filter(({ imageId }) => failedIds.has(imageId));

        setProgressLabel(`Retrying ${retryTargets.length} failed TikZ visual${retryTargets.length === 1 ? '' : 's'}`);
        setProgressTotal(targets.length + retryTargets.length);
        const retryResults = await reviewTargets(retryTargets);

        await applyApproved(retryResults.flatMap(({ item }) => item ? [item] : []));
        unresolved = retryResults.flatMap(({ unresolved }) => unresolved ? [unresolved] : []);
      }

      // QA failures are warnings, not a stage failure. Flagged Image rows
      // remain visible and Fast Forward can proceed with later stages.
      await completeStage(FIX_IMAGES_STAGE, changed > 0);
      setNotice(`Fix images finished: ${changed} approved correction${changed === 1 ? '' : 's'} applied; ${unresolved.length} visual${unresolved.length === 1 ? '' : 's'} still flagged for manual review. Fast Forward will continue.`);
      refreshContent();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Unable to review and fix TikZ visuals.');
      }
      refreshContent();
    } finally {
      endProgress();
    }
  }, [addFixImagesCost, autoRunAll, beginProgress, book.age, completeStage, createClient, effectiveModel, endProgress, imageFixTargetsForRun, language, onAction, refreshContent]);

  const closeImageFixReview = useCallback((): void => {
    setImageFixReview(null);
    setNotice('Proposed TikZ corrections were discarded. Failed visual QA flags remain on the original images for later retry.');
  }, []);

  const applyImageFixReview = useCallback(async (): Promise<void> => {
    if (!imageFixReview) {
      return;
    }

    setIsBusy(true);
    setError('');
    setProgress(0);
    setProgressLabel('Applying TikZ corrections');
    setProgressTotal(Math.max(1, imageFixReview.items.length));
    let applied = 0;

    try {
      await Promise.all(imageFixReview.items.map(async ({ fixedTikz, finalReviewResult, imageId, originalTikz, prompt, record }) => {
        const image = await getImage(imageId);

        if (!image) {
          throw new Error(`Image ${imageId} referenced by Ability ${record.id} was not found.`);
        }

        if (image.data !== originalTikz || finalReviewResult.sourceVersion !== tikzSourceVersion(fixedTikz) || finalReviewResult.hasErrors) {
          throw new Error(`Image ${imageId} changed since visual QA, or the candidate has no clean PNG review.`);
        }

        await putImage({ ...image, data: fixedTikz, prompt: prompt || image.prompt, type: 'tikz', valid: true,
          sourceVersion: finalReviewResult.sourceVersion, renderStatus: 'passed', visualQaStatus: 'passed',
          detectedIssues: [], reviewResult: finalReviewResult }, originalTikz);
        applied += 1;
        setProgress(applied);
      }));

      const hasChanges = imageFixReview.items.length > 0;

      if (hasChanges || !stageDone(FIX_IMAGES_STAGE)) {
        await completeStage(FIX_IMAGES_STAGE, hasChanges);
      }

      const fixed = imageFixReview.items.length;
      const failed = imageFixReview.unresolved.length;

      setImageFixReview(null);
      setNotice(`Fix images completed: ${fixed} approved TikZ correction${fixed === 1 ? '' : 's'} applied; ${failed} visual${failed === 1 ? '' : 's'} still flagged for retry in Abilities. Processing can continue.`);
      refreshContent();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      setImageFixReview(null);
      refreshContent();
      setError(caught instanceof Error ? caught.message : 'Unable to apply Fix images changes.');
    } finally {
      setIsBusy(false);
    }
  }, [imageFixReview, onAction, refreshContent, completeStage, stageDone]);

  const openImageFix = useCallback((): void => {
    setFixOnlyFailedTikz(failedTikzTargets.length > 0);
    setAiAction('fixImages');
  }, [failedTikzTargets.length]);
  const confirm = useCallback((): void => {
    if (aiAction === 'skills') {
      generateSkills().catch(console.error);
    }

    if (aiAction === 'exercises') {
      generateExercises().catch(console.error);
    }

    if (aiAction === 'fixExercises') {
      fixExercises().catch(console.error);
    }

    if (aiAction === 'fix') {
      fixAbilities().catch(console.error);
    }

    if (aiAction === 'images') {
      completeImagesStage().catch(console.error);
    }

    if (aiAction === 'fixImages') {
      fixImages().catch(console.error);
    }
  }, [aiAction, completeImagesStage, fixAbilities, fixExercises, fixImages, generateExercises, generateSkills]);

  useEffect((): void => {
    if (autoRunAll && aiAction && !isBusy) {
      confirm();
    }
  }, [aiAction, autoRunAll, confirm, isBusy]);

  useEffect((): void => {
    if (!autoRunAll || isBusy) {
      return;
    }

    if (exerciseFixReview) {
      void applyExerciseFixReview();
    } else if (fixReview) {
      void applyAbilityFixReview();
    } else if (imageFixReview) {
      void applyImageFixReview();
    }
  }, [applyAbilityFixReview, applyExerciseFixReview, applyImageFixReview, autoRunAll, exerciseFixReview, fixReview, imageFixReview, isBusy]);
  const closeConfirmation = useCallback((): void => {
    setAiAction(undefined);
    setGenerateOnlyMissingAbilities(false);
    setGenerateOnlyMissingImages(false);
    setFixOnlyFailedTikz(false);
  }, []);

  const pipelineActions = useMemo<PipelineAction[]>(() => [
    ...(pipelinePrefix ?? []).filter((action) => action.key !== 'exercises' && action.key !== 'fixExercises').map((action) => action.key === 'concepts'
      ? { ...action, isResultComplete: chapterContent.length > 0 && chapterContent.every(({ concepts }) => concepts.length > 0) }
      : action),
    {
      key: 'abilities',
      label: 'Abilities',
      isDone: stageDone(ABILITIES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageDone('refineChapters') || !allConcepts.length,
      isResultComplete: exercisesMissingAbilities.length === 0,
      onClick: openExerciseGeneration,
      onRetryMissing: retryMissingAbilities
    },
    {
      key: 'fixAbilities',
      label: 'Fix abilities',
      isDone: stageDone(FIX_ABILITIES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageDone(ABILITIES_STAGE) || !hasAbilities,
      onClick: openAbilityFix
    },
    {
      key: 'images',
      label: 'Images',
      isDone: stageDone(IMAGES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageDone(FIX_ABILITIES_STAGE) || !hasAbilities,
      isResultComplete: missingImageGenerationTargets.length === 0,
      onClick: openImages,
      onRetryMissing: retryMissingImages
    },
    {
      key: 'fixImages',
      label: bookVisualQaStatus === 'failed' ? 'Fix images (issues flagged)' : 'Fix images',
      isDone: stageDone(FIX_IMAGES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageDone(IMAGES_STAGE) || !hasAbilities,
      onClick: openImageFix
    },
    ...(pipelineSuffix ?? [])
  ], [allExercises.length, chapterContent, conceptsMissingExercises.length, exercisesMissingAbilities.length, hasAbilities, hasBookLanguage, hasBookSubject, isBusy, missingImageGenerationTargets.length, openAbilityFix, openExerciseFix, openExerciseGeneration, openImageFix, openImages, pipelinePrefix, pipelineSuffix, retryMissingAbilities, retryMissingImages, stageDone, bookVisualQaStatus]);
  const visiblePipelineActions = useMemo(() => {
    const firstIncompleteIndex = pipelineActions.findIndex(({ isDone }) => !isDone);

    // A stage is only selectable once every stage before it is complete. Keep
    // completed stages available for re-runs, plus exactly the next stage.
    return firstIncompleteIndex === -1
      ? pipelineActions
      : pipelineActions.slice(0, firstIncompleteIndex + 1);
  }, [pipelineActions]);
  const [selectedPipelineKey, setSelectedPipelineKey] = useState('');
  const previousPipelineDoneRef = useRef<Map<string, boolean>>(new Map());
  const pipelineBookIdRef = useRef(book.id);

  useEffect(() => {
    if (!visiblePipelineActions.length) {
      setSelectedPipelineKey('');
      previousPipelineDoneRef.current = new Map();
      return;
    }

    if (pipelineBookIdRef.current !== book.id) {
      pipelineBookIdRef.current = book.id;
      previousPipelineDoneRef.current = new Map(pipelineActions.map(({ isDone, key }) => [key, isDone] as const));
      const next = visiblePipelineActions.find(({ isDone }) => !isDone)
        ?? visiblePipelineActions[visiblePipelineActions.length - 1];

      setSelectedPipelineKey(next?.key ?? '');
      return;
    }

    const previousDone = previousPipelineDoneRef.current;
    const currentAction = visiblePipelineActions.find(({ key }) => key === selectedPipelineKey);
    const previousCurrentAction = pipelineActions.find(({ key }) => key === selectedPipelineKey);
    const justCompleted = previousCurrentAction
      && previousDone.get(previousCurrentAction.key) === false
      && previousCurrentAction.isDone;

    if (!currentAction || justCompleted) {
      const next = visiblePipelineActions.find(({ isDone }) => !isDone)
        ?? visiblePipelineActions[visiblePipelineActions.length - 1];

      setSelectedPipelineKey(next?.key ?? '');
    }

    previousPipelineDoneRef.current = new Map(pipelineActions.map(({ isDone, key }) => [key, isDone] as const));
  }, [book.id, pipelineActions, selectedPipelineKey, visiblePipelineActions]);

  const selectedPipelineAction = visiblePipelineActions.find(({ key }) => key === selectedPipelineKey);

  useEffect((): void => {
    onPipelineSelectionChange?.(selectedPipelineKey);
  }, [onPipelineSelectionChange, selectedPipelineKey]);

  // Fast Forward is a manager-owned state machine. This effect supplies only
  // the most recent stage adapters and a view of readiness; no cursor or retry
  // counter is stored in this component, so a remount does not restart stages.
  useEffect((): void => {
    if (!autoRunAll) return;

    bookProcessingManager.stepFastForward(book.id, {
      actions: pipelineActions,
      busy: isBusy || externalAutoRunBusy,
      contentReady: isContentSnapshotCurrent,
      hasReview: Boolean(aiAction || fixReview || exerciseFixReview || imageFixReview),
      error,
      onComplete: () => onAutoRunComplete?.(),
      onError: (message) => {
        setError(message);
        onAbortAutoRun?.();
      }
    });
  }, [aiAction, autoRunAll, book.id, error, exerciseFixReview, externalAutoRunBusy, fixReview, imageFixReview, isBusy, isContentSnapshotCurrent, onAbortAutoRun, onAutoRunComplete, pipelineActions, processingRun]);

  const autoRunCompletedCount = autoRunStageKeys.reduce((count, key) => {
    if (processingRun?.completed.includes(key)) return count + 1;
    const action = pipelineActions.find(({ key: actionKey }) => actionKey === key);

    return count + (action?.isDone && (!action.onRetryMissing || action.isResultComplete !== false) ? 1 : 0);
  }, 0);
  const autoRunProgress = autoRunStageKeys.length ? Math.round(autoRunCompletedCount * 100 / autoRunStageKeys.length) : 100;

  useEffect((): void => {
    if (!autoRunAll) {
      onAutoRunProgressChange?.(undefined);
      return;
    }

    onAutoRunProgressChange?.({
      completed: autoRunCompletedCount,
      percent: autoRunProgress,
      total: autoRunStageKeys.length
    });
  }, [autoRunAll, autoRunCompletedCount, autoRunProgress, autoRunStageKeys.length, onAutoRunProgressChange]);

  useEffect((): void => {
    if (!autoRunAll) {
      onAutoRunProcessingChange?.(undefined);
      return;
    }

    // Keep the last active stage status in the parent while Fast Forward moves
    // between stages. Clearing it during the short idle hand-off would make the
    // processing modal disappear and re-open, which causes a visible blink.
    if (isBusy) {
      onAutoRunProcessingChange?.({
        label: progressLabel,
        progressTotal,
        progressValue: progress,
        spent: openRouterSpent
      });
    } else if (error) {
      // Do not keep a completed/failed stage label alive while Fast Forward is
      // being stopped by the stage-error effect above.
      onAutoRunProcessingChange?.(undefined);
    }
  }, [autoRunAll, error, isBusy, onAutoRunProcessingChange, openRouterSpent, progress, progressLabel, progressTotal]);

  const runSelectedPipelineAction = useCallback((): void => {
    if (!selectedPipelineAction || selectedPipelineAction.isDisabled) {
      return;
    }

    selectedPipelineAction.onClick();
  }, [selectedPipelineAction]);

  return <StyledSkills className={pipelineOnly ? 'pipelineOnly' : undefined}>
    {editingChapter && <ChapterTitleEditor
      chapter={editingChapter}
      language={book.language}
      onClose={closeChapterEditor}
      onError={setError}
      onSaved={refresh}
                       />}
    <SkillsReviewModals
      applyAbilityFixReview={applyAbilityFixReview}
      applyExerciseFixReview={applyExerciseFixReview}
      applyImageFixReview={applyImageFixReview}
      autoRunAll={autoRunAll}
      closeExerciseFixReview={closeExerciseFixReview}
      closeFixReview={closeFixReview}
      closeImageFixReview={closeImageFixReview}
      exerciseFixReview={exerciseFixReview}
      fixReview={fixReview}
      imageFixReview={imageFixReview}
      isBusy={isBusy}
    />
    <SkillsControls
      abilitiesMissingImagesCount={abilitiesMissingImages.size}
      failedTikzCount={failedTikzAbilityCount}
      fixOnlyFailedTikz={fixOnlyFailedTikz}
      abortProcessing={abortProcessing}
      aiAction={aiAction}
      autoRunAll={autoRunAll}
      autoRunCompletedCount={autoRunCompletedCount}
      autoRunStageCount={autoRunStageKeys.length}
      closeConfirmation={closeConfirmation}
      confirm={confirm}
      error={error}
      estimate={estimate}
      exercisesMissingAbilitiesCount={exercisesMissingAbilities.length}
      generateOnlyMissingAbilities={generateOnlyMissingAbilities}
      generateOnlyMissingImages={generateOnlyMissingImages}
      isBusy={isBusy}
      notice={notice}
      openRouterSpent={openRouterSpent}
      pipelineControls={pipelineControls}
      progress={progress}
      progressLabel={progressLabel}
      progressTotal={progressTotal}
      runSelectedPipelineAction={runSelectedPipelineAction}
      selectedModel={selectedModel}
      selectedPipelineAction={selectedPipelineAction}
      selectedPipelineKey={selectedPipelineKey}
      setGenerateOnlyMissingAbilities={setGenerateOnlyMissingAbilities}
      setGenerateOnlyMissingImages={setGenerateOnlyMissingImages}
      setFixOnlyFailedTikz={setFixOnlyFailedTikz}
      setSelectedModel={setSelectedModel}
      setSelectedPipelineKey={setSelectedPipelineKey}
      showPipeline={showPipeline}
      visiblePipelineActions={visiblePipelineActions}
    />
    <SkillsContentView
      abilitiesOutputRef={abilitiesOutputRef}
      bookId={book.id}
      chapterContentOutputRef={chapterContentOutputRef}
      chapterIndex={chapterIndex}
      chapters={chapters}
      changeChapter={changeChapter}
      current={current}
      currentMissingAbilityIndexes={currentMissingAbilityIndexes}
      deleteConceptWithExercises={deleteConceptWithExercises}
      deleteExerciseWithAbilities={deleteExerciseWithAbilities}
      fixSingleAbility={redoConceptFromStage}
      isBusy={isBusy}
      fixSingleExercise={fixSingleExercise}
      focusAbilityExercise={focusAbilityExercise}
      failedVisualCountsByChapter={failedVisualCountsByChapter}
      missingAbilityCountsByChapter={missingAbilityCountsByChapter}
      onError={setError}
      openChapterEditor={openChapterEditor}
      pipelineOnly={pipelineOnly}
      refresh={refresh}
      refreshContent={refreshContent}
      saveExercise={saveExercise}
      tikzIssuesByImageId={tikzIssuesByImageId}
      view={view}
    />
  </StyledSkills>;
}

export default React.memo(Skills);
