// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookAbilityWorkItem, BookChapter, BookConcept, BookPage, BookProcessingStageKey, BookStageSpendKey, Skill, TikzReviewResult } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../abilities/abilities.js';
import type { AbilityWorkflowJsonRunner } from '../../book/domain/abilities/abilityWorkflow.js';
import type { AiAction, ChapterContent, DuplicateAbilityReview, FixedImageReview, FixReviewResult, ImageFixReviewResult, UnresolvedImageReview, PipelineAction, SkillSource, SkillsProps, SkillsView } from './SkillsTypes.js';

import { ABILITY_FIX_FIELDS, effectiveAbilityFixInstructions, addBookAbilityChangeLog, getBookAbilityWorkQueue, addBookStageSpend, completeBookProcessingStage, createBookConcept, ensureAbilityAnswerImage, ensureAbilityQuestionImage, deleteAbilities, deleteAbility, deleteBookConcept, getAbilities, getBookChapters, getBookCompletedStages, invalidateBookProcessingStages, getBookConceptsForBookPage, getBookPages, getSetting, getSkillsForChapter, getImage, getBookVisualQaSummary, hydrateAbilityContent, setBookAbilityReviewed, resetBookAbilityReviews, isBookProcessingStageSatisfied, putImage, replaceBookConceptWithChildren, setTikzImageQaState, tikzSourceVersion, replaceAbility, replaceAbilities, replaceSkillsForChapter, resetBookProcessingStagesFrom, SettingKey } from '@slonigiraf/db';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal } from '@polkadot/react-components';

import type { TikzPreRenderResult } from '../../../Edit/TikzDisplay.js';
import { isTikzCode } from '../../../Edit/tikz.js';
import { shouldSkipStoredTikzCompile } from '../../../Edit/tikzValidation.js';
import { rasterizeTikzSvg } from '../../book/application/abilities/tikzRaster.js';
import { parseStoredAbility } from '../../../abilities/abilities.js';
import { assertAbilityFixResultChanged } from './abilityFixValidation.js';
import { planAbilityFix, prepareRegeneratedAbilityVisuals } from './abilityFixPlan.js';
import { bookProcessingManager } from '../../book/application/pipeline/bookProcessingManager.js';
import { skipBookStage } from '../../book/application/pipeline/skipBookStage.js';
import { nextUnresolvedStage } from '../../book/application/pipeline/bookStageNavigation.js';
import { useBookProcessingRun } from '../../book/application/pipeline/useBookProcessingRun.js';
import { bookLanguageLabel } from '../../book/domain/metadata/bookLanguage.js';
import { conceptRedoStagesFrom, type ConceptRedoStage } from './conceptRedoStages.js';
import { parseFixedConcept } from '../../book/domain/concepts/fixConcepts.js';
import { fixSingleConceptPrompt } from '../../book/application/concepts/conceptPrompts.js';
import { parseSplitConcepts, splitConceptPrompt } from '../../book/domain/concepts/splitConcept.js';
import { addBookExternalCall } from '../../book/infrastructure/storage/bookExternalCalls.js';
import { estimateAiInput, estimateAiRequests, type AiInputEstimate, type AiRequestEstimate } from '../../book/application/pricing/aiEstimate.js';
import { DEFAULT_PROCESSING_MODEL } from '../../book/application/config.js';
import { CONCEPT_ABILITY_WORKFLOW_SYSTEM_PROMPT, FIX_ABILITIES_REQUEST_PROMPT, REPAIR_SYSTEM_PROMPT, SKILLS_GENERATION_SYSTEM_PROMPT, SOURCES_TO_SKILLS_REQUEST_PROMPT } from '../../book/infrastructure/ai/prompts/abilities.js';
import { conceptAbilityGenerationPrompt, generateConceptAbility } from '../../book/domain/abilities/conceptAbilityWorkflow.js';
import { mapConcurrent } from '../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY } from '../../../openrouter/concurrency.js';
import { useBookStageTimer } from '../../book/infrastructure/storage/bookStageTime.js';
import { stripMarkdownImageReferences } from '../../book/infrastructure/pdf/bookImageRefs.js';
import { abilityWithDirectConceptTitle } from '../../book/domain/concepts/conceptTitles.js';
import { resolveSharedChapterIndex } from '../../book/domain/chapters/chapterSelection.js';
import { getSharedChapterSelection, storeSharedChapterSelection, subscribeSharedChapterSelection } from '../../book/infrastructure/storage/chapterSelectionStorage.js';
import { abilityModuleId, abilityRepairInput, answerTikzRequestPrompt, exerciseNeedsCompletedFigure, cleanTikzResponse, conceptAbilityModuleId, parseGeneratedSkills, parseTikzAiReview, requestAbilityRepairResult, requestChatContent, requestChatContentWithTruncationRetry, requestValidatedJson, storedAbilityImageId, tikzCompileRepairPrompt, tikzDetectedProblemsRepairPrompt, tikzFixReviewPrompt, tikzRequestPrompt, type ImageFixTarget, type StoredAbility, type TikzAiReview } from '../../book/application/abilities/abilityProcessing.js';
import { ChapterTitleEditor } from './components/SkillsComponents.js';
import SkillsContentView from './components/SkillsContentView.js';
import AbilityReviewMode from './components/AbilityReviewMode.js';
import QueuedAbilityWorkList from './components/QueuedAbilityWorkList.js';
import { queuedAbilityReviewSelection } from './components/queuedAbilityWorkLabel.js';
import SkillsControls from './components/SkillsControls.js';
import SkillsReviewModals from './components/SkillsReviewModals.js';
import { RereviewChapterSelector, StyledSkills } from './SkillsStyles.js';
import { AiPriceEstimate } from '../../shared/ui/PriceEstimate.js';
import StageRunPricePopup from '../../shared/ui/StageRunPricePopup.js';
import OpenRouterModelSelector from '../../../openrouter/components/ModelSelector.js';

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
  // Image QA force-retries it so legacy/transient false flags can heal.
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
  const role = target.field === 'p' ? 'question' : 'solution';
  const regenerateFromSpecification = async (source: string): Promise<string> => {
    const visualPrompt = target.prompt || `Create the required ${role} visual for this exercise from the exercise text and correct answer.`;
    const content = await requestChatContent(
      client, model,
      'You regenerate educational diagrams as compact, browser-renderable TikZ. Return only one TikZ picture block.',
      target.field === 'i'
        ? answerTikzRequestPrompt(language, target.ability, target.exerciseIndex, visualPrompt, age)
        : tikzRequestPrompt(language, target.ability, target.exerciseIndex, target.field, visualPrompt, age),
      false, onCost, 4_000, signal
    );
    const proposal = cleanTikzResponse(content);

    if (proposal.trim() === source.trim()) {
      throw new Error('TikZ regeneration repeated the rejected candidate without fixing it.');
    }

    return proposal;
  };

  const previouslyReviewed = await getImage(target.imageId);
  const previousAssessmentErrors = [...new Set([
    ...(previouslyReviewed?.detectedIssues ?? []),
    ...(previouslyReviewed?.reviewResult?.errors ?? []),
    ...(target.previousAssessmentErrors ?? [])
  ].filter(Boolean))];
  const assessedTarget: ImageFixTarget = { ...target, previousAssessmentErrors };
  let source = target.originalTikz;
  let preRender = originalPreRender;
  let detectedIssues: string[] = [...previousAssessmentErrors];
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
    // Known failed images start with a targeted repair, not a redundant
    // assessment of the already rejected original. Every proposed correction
    // must still render and undergo its own NEW PNG visual review.
    if (previousAssessmentErrors.length) {
      const repaired = await requestValidatedJson(
        client, model,
        'Repair the previously diagnosed image errors. Return JSON with corrected TikZ source.',
        tikzDetectedProblemsRepairPrompt(language, assessedTarget, { hasErrors: true, errors: previousAssessmentErrors, tikz: source }, originalPreRender, age),
        parseTikzAiReview, true, onCost, TIKZ_REVIEW_MAX_OUTPUT_TOKENS, undefined, 2, signal
      );
      source = repaired.tikz.trim() !== source.trim() ? repaired.tikz : await regenerateFromSpecification(source);
      preRender = await preRenderTikzLazy(source);
    }
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
      const reviewTarget = { ...assessedTarget, originalTikz: source };
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
          'Apply the specific image issues found by visual QA. Return JSON with an actually changed TikZ source.',
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
const ABILITIES_STAGE: BookProcessingStageKey = 'abilities';
const FIX_ABILITIES_STAGE: BookProcessingStageKey = 'fixAbilities';
const IMAGES_STAGE: BookProcessingStageKey = 'images';
const FIX_IMAGES_STAGE: BookProcessingStageKey = 'fixImages';
const ANSWER_IMAGES_STAGE: BookProcessingStageKey = 'answerImages';
const FIX_ANSWER_IMAGES_STAGE: BookProcessingStageKey = 'fixAnswerImages';
const TIKZ_RENDER_CONCURRENCY = 4;
const TIKZ_REVIEW_MAX_OUTPUT_TOKENS = 6_000;
const MAX_TIKZ_VISUAL_REVIEW_ATTEMPTS = 3;
const EMPTY_SPLIT_QUEUE: readonly number[] = [];
const EMPTY_WORK_QUEUE: readonly BookAbilityWorkItem[] = [];

const chapterSessionKey = (bookId: number, view: SkillsView): string => `knowledge-upload-book-${bookId}-${view}-chapter`;

// Keep Review mode open across page reloads, scoped to this book, view and tab.
const reviewSessionKey = (bookId: number, view: SkillsView): string => `knowledge-upload-book-${bookId}-${view}-ability-review`;

function getSessionReviewMode (bookId: number, view: SkillsView): boolean {
  try {
    return sessionStorage.getItem(reviewSessionKey(bookId, view)) === 'open';
  } catch {
    return false;
  }
}

// A rereview pass covers only the Abilities in the chapters selected in the
// dialog. Keep its scope across reloads, just like the review navigation.
function getSessionReviewAbilityIds (bookId: number, view: SkillsView): string[] | undefined {
  try {
    const raw = sessionStorage.getItem(`${reviewSessionKey(bookId, view)}-scope`);
    if (raw === null) return undefined;
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? parsed as string[] : undefined;
  } catch {
    return undefined;
  }
}

// Only a rereview session started from the scheduled queue permits reviewing
// queued Fix/Split Abilities before those jobs run.
function getSessionScheduledRereview (bookId: number, view: SkillsView): boolean {
  try {
    const key = reviewSessionKey(bookId, view);

    return sessionStorage.getItem(key) === 'open' && sessionStorage.getItem(`${key}-scheduled`) === 'open';
  } catch {
    return false;
  }
}

function getSessionChapter (bookId: number, view: SkillsView): number {
  try {
    const stored = Number(sessionStorage.getItem(chapterSessionKey(bookId, view)));

    return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function Skills ({ autoRunAll = false, autoRunStartKey, autoRunSkipRefineChapters = false, book, externalAutoRunBusy = false, externalRefreshToken = 0, onAction, onAutoRunComplete, onAutoRunProcessingChange, onAutoRunProgressChange, onAbortAutoRun, onBookChange, onContentChange, onEntityCountsChange, onPipelineSelectionChange, pipelineOnly = false, pipelineControls, pipelinePrefix, pipelineSuffix, showPipeline = true, view, splitQueueConceptIds, workQueueItems, onQueueSplit, onQueueFix, onCancelFix, onRemoveWorkQueueItem, removingWorkQueueItemId, onAbilityLogChange, onWorkQueueItemComplete, onSplitQueueBusyChange, externalSplitQueueBusy = false, isSplitQueueConfirmationOpen = false, isQueueRunDisabled = false, onCloseSplitQueueConfirmation }: SkillsProps): React.ReactElement {
  const language = book.language ?? '';
  const hasBookLanguage = Boolean(language);
  const hasBookSubject = Boolean(book.subject);
  const [aiAction, setAiAction] = useState<AiAction>();
  const [chapterContent, setChapterContent] = useState<ChapterContent[]>([]);
  const [chapterIndex, setChapterIndex] = useState(() => getSessionChapter(book.id, view));
  const [isReviewModeOpen, setIsReviewModeOpen] = useState(() => getSessionReviewMode(book.id, view));
  const [reviewAbilityIds, setReviewAbilityIds] = useState<readonly string[] | undefined>(() => getSessionReviewAbilityIds(book.id, view));
  const [isScheduledRereview, setIsScheduledRereview] = useState(() => getSessionScheduledRereview(book.id, view));
  const activeReviewSessionKey = reviewSessionKey(book.id, view);
  const reviewScopeSessionKey = `${activeReviewSessionKey}-scope`;
  const scheduledReviewSessionKey = `${activeReviewSessionKey}-scheduled`;

  // A mounted Skills page can switch books or views without being remounted.
  useEffect(() => {
    setIsReviewModeOpen(getSessionReviewMode(book.id, view));
    setReviewAbilityIds(getSessionReviewAbilityIds(book.id, view));
    setIsScheduledRereview(getSessionScheduledRereview(book.id, view));
  }, [book.id, view]);

  const [isRereviewDialogOpen, setIsRereviewDialogOpen] = useState(false);
  const [rereviewChapterIndexes, setRereviewChapterIndexes] = useState<Set<number>>(() => new Set());
  const [isResettingReview, setIsResettingReview] = useState(false);
  const [editingChapter, setEditingChapter] = useState<BookChapter>();
  const [error, setError] = useState('');
  const [fixReview, setFixReview] = useState<FixReviewResult | null>(null);
  const [imageFixReview, setImageFixReview] = useState<ImageFixReviewResult | null>(null);
  const [imageFixReviewStage, setImageFixReviewStage] = useState<'fixImages' | 'fixAnswerImages'>('fixImages');
  const [generateOnlyMissingAbilities, setGenerateOnlyMissingAbilities] = useState(false);
  const [generateOnlyMissingImages, setGenerateOnlyMissingImages] = useState(false);
  const [fixOnlyFailedTikz, setFixOnlyFailedTikz] = useState(false);
  const [tikzIssuesByImageId, setTikzIssuesByImageId] = useState<Record<number, string[]>>({});
  const [notice, setNotice] = useState('');
  const [splitQueueEstimateState, setSplitQueueEstimateState] = useState<{ key: string; estimate: AiInputEstimate | string }>();
  const [queueRemovalError, setQueueRemovalError] = useState('');
  const splitBatchRunningRef = useRef(false);
  const splitBatchCancelledRef = useRef(false);
  const queuedWorkItems = workQueueItems ?? EMPTY_WORK_QUEUE;
  const queuedSplitIds = splitQueueConceptIds ?? EMPTY_SPLIT_QUEUE;
  const queuedFixItems = queuedWorkItems.filter((item) => item.kind === 'fix');
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
  const [failedContentSnapshotKey, setFailedContentSnapshotKey] = useState('');
  const splitEstimateKey = `${book.id}:${effectiveModel}:${JSON.stringify(queuedWorkItems)}:${loadedContentSnapshotKey}`;
  const splitQueueEstimate = splitQueueEstimateState?.key === splitEstimateKey ? splitQueueEstimateState.estimate : undefined;
  const processingRun = useBookProcessingRun(book.id);
  const autoRunStageKeys = processingRun?.mode === 'fastForward' ? processingRun.stages : [];
  const previousRunStatusRef = useRef(processingRun?.status);

  useEffect(() => {
    if (previousRunStatusRef.current === 'failed' && processingRun?.status === 'running') setError('');
    previousRunStatusRef.current = processingRun?.status;
  }, [processingRun?.status]);
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
  const isReviewDataLoadFailed = failedContentSnapshotKey === contentSnapshotKey;
  const isReviewDataLoading = !isContentSnapshotCurrent && !isReviewDataLoadFailed;
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
  const addAbilitiesCost = useCallback((costUsd: number): void => addStageCost('abilities', costUsd), [addStageCost]);
  const addFixAbilitiesCost = useCallback((costUsd: number): void => addStageCost('fixAbilities', costUsd), [addStageCost]);
  const addImagesCost = useCallback((costUsd: number): void => addStageCost('images', costUsd), [addStageCost]);
  const addFixImagesCost = useCallback((costUsd: number): void => addStageCost('fixImages', costUsd), [addStageCost]);
  const addAnswerImagesCost = useCallback((costUsd: number): void => addStageCost('answerImages', costUsd), [addStageCost]);
  const addFixAnswerImagesCost = useCallback((costUsd: number): void => addStageCost('fixAnswerImages', costUsd), [addStageCost]);
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
      const pageRows = await Promise.all(pages.map(async (page: BookPage) => ({
        concepts: await getBookConceptsForBookPage(book.id, page.pageNumber),
        page
      })));
      const result = await Promise.all(chapters.map(async (chapter): Promise<ChapterContent> => {
        const skills = chapter.id === undefined ? [] : await getSkillsForChapter(chapter.id);
        const chapterConcepts = [
          ...pageRows.flatMap(({ concepts, page }) => concepts.filter((concept) => concept.chapterId !== undefined
            ? concept.chapterId === chapter.id
            : page.chapter === chapter.title)),
          ...pageLessConcepts.filter(({ chapterId }) => chapterId !== undefined && chapterId === chapter.id)
        ].sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER) || (a.id ?? 0) - (b.id ?? 0));
        // Keep the already-sorted Concept sequence, not a global Ability
        // displayOrder/hash sort (which can differ from Concept learning order).
        const conceptRecords = (await Promise.all(chapterConcepts.flatMap(({ id }) => id === undefined ? [] : [getAbilities(conceptAbilityModuleId(book.id, id))]))).flat();
        const abilities = await Promise.all(conceptRecords.map(async ({ content, displayOrder, id, moduleId, reviewed }): Promise<StoredAbility> => {
          try {
            const hydratedContent = await hydrateAbilityContent(content);

            return { ability: parseStoredAbility(hydratedContent), content, displayOrder, id, moduleId, reviewed };
          } catch {
            return { ability: null, content, displayOrder, id, moduleId, reviewed };
          }
        }));

        return { abilities, chapter, concepts: chapterConcepts, skills };
      }));

      if (active) {
        const sharedSelection = getSharedChapterSelection(book.id);

        setChapterContent(result);
        setChapterIndex((current) => sharedSelection
          ? resolveSharedChapterIndex(sharedSelection, result.map(({ chapter }) => chapter))
          : Math.min(current, Math.max(0, result.length - 1)));
        // Set this in the same committed update as chapterContent. A subsequent
        // refresh changes contentSnapshotKey synchronously, making the snapshot
        // stale again until the matching async DB read has finished.
        setFailedContentSnapshotKey('');
        setLoadedContentSnapshotKey(contentSnapshotKey);
      }
    };

    load().catch(() => {
      if (!active) return;
      setFailedContentSnapshotKey(contentSnapshotKey);
      setError('Unable to load this book’s learning content.');
    });

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
  const allAbilities = useMemo(() => chapterContent.flatMap(({ abilities }) => abilities), [chapterContent]);
  const abilityModuleIds = useMemo(() => new Set(allAbilities.map(({ moduleId }) => moduleId)), [allAbilities]);
  const conceptsMissingAbilities = useMemo(() => allConcepts.filter(({ id }) => id === undefined || !abilityModuleIds.has(conceptAbilityModuleId(book.id, id))), [abilityModuleIds, allConcepts, book.id]);
  const missingAbilityIndexesByChapter = useMemo(() => chapterContent.map(({ concepts }) => concepts.flatMap(({ id }, conceptIndex) => id === undefined || !abilityModuleIds.has(conceptAbilityModuleId(book.id, id)) ? [conceptIndex] : [])), [abilityModuleIds, book.id, chapterContent]);
  const missingAbilityCountsByChapter = useMemo(() => missingAbilityIndexesByChapter.map((indexes) => indexes.length), [missingAbilityIndexesByChapter]);
  const currentMissingAbilityIndexes = missingAbilityIndexesByChapter[chapterIndex] ?? [];
  const focusConceptAbility = useCallback((exerciseIndex: number): void => {
    const conceptId = current?.concepts[exerciseIndex]?.id;
    const conceptSection = Array.from(abilitiesOutputRef.current?.querySelectorAll<HTMLElement>('[data-concept-id]') ?? [])
      .find((section) => section.dataset.conceptId === String(conceptId))
      ?? abilitiesOutputRef.current?.querySelector<HTMLElement>('.orphanAbilities');

    conceptSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    conceptSection?.focus({ preventScroll: true });
  }, [current]);

  useEffect(() => {
    onEntityCountsChange?.({ abilities: allAbilities.length });
  }, [allAbilities.length, onEntityCountsChange]);
  useEffect(() => {
    if (!conceptsMissingAbilities.length && generateOnlyMissingAbilities) {
      setGenerateOnlyMissingAbilities(false);
    }
  }, [conceptsMissingAbilities.length, generateOnlyMissingAbilities]);
  const conceptsById = useMemo(() => new Map(chapterContent.flatMap(({ concepts }) => concepts.flatMap((concept) => concept.id === undefined ? [] : [[concept.id, concept] as const]))), [chapterContent]);
  const imageGenerationTargets = useMemo(() => allAbilities.flatMap((record) => record.ability
    ? record.ability.q.flatMap((exercise, exerciseIndex) => (['p'] as const).flatMap((field) => {
      const value = exercise[field].trim();
      const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
      const storedPrompt = exercise[promptField]?.trim() ?? '';
      // Prompt-only Image rows hydrate with an empty visual value because
      // Image.data is null until generation. Always source generation from the
      // semantic prompt when it exists; keep the old fallback for legacy input.
      const visualPrompt = storedPrompt || (isTikzCode(value) ? `Recreate the original question visual, preserving its meaning and layout: ${value}` : value);
      const imageId = storedAbilityImageId(record, exerciseIndex, field);

      return visualPrompt && imageId !== undefined ? [{ exerciseIndex, field, imageId, record, visualPrompt }] : [];
    }))
    : []), [allAbilities]);
  const answerImageGenerationTargets = useMemo(() => allAbilities.flatMap((record) => record.ability
    ? record.ability.q.flatMap((exercise, exerciseIndex) => {
      const questionTikz = isTikzCode(exercise.p);
      const existingAnswer = exercise.i.trim();
      const visualPrompt = exercise.iPrompt?.trim() || (!isTikzCode(existingAnswer) ? existingAnswer : '');
      // Some legacy tasks ask learners to complete a diagram but have no
      // explicit answer-image prompt. Create the answer reference in that case.
      const needsFigure = questionTikz && exerciseNeedsCompletedFigure(exercise.h);

      if (!visualPrompt && !needsFigure && !isTikzCode(existingAnswer)) return [];

      return [{ exerciseIndex, imageId: storedAbilityImageId(record, exerciseIndex, 'i'), record,
        visualPrompt: visualPrompt || 'Show the correctly completed version of the question figure.' }];
    })
    : []), [allAbilities]);
  const missingAnswerImageGenerationTargets = useMemo(() => answerImageGenerationTargets.filter(({ exerciseIndex, record }) =>
    !isTikzCode(record.ability?.q[exerciseIndex]?.i ?? '')), [answerImageGenerationTargets]);
  const answerImageGenerationTargetsForRun = generateOnlyMissingImages ? missingAnswerImageGenerationTargets : answerImageGenerationTargets;
  const missingImageGenerationTargets = useMemo(() => imageGenerationTargets.filter(({ exerciseIndex, field, record }) => {
    const value = record.ability?.q[exerciseIndex]?.[field] ?? '';

    return !isTikzCode(value);
  }), [imageGenerationTargets]);
  const abilitiesMissingImages = useMemo(() => new Set(missingImageGenerationTargets.map(({ record }) => record.id)), [missingImageGenerationTargets]);
  const imageGenerationTargetsForRun = generateOnlyMissingImages ? missingImageGenerationTargets : imageGenerationTargets;
  useEffect(() => {
    if (generateOnlyMissingImages && (
      (aiAction === 'images' && !abilitiesMissingImages.size) ||
      (aiAction === 'answerImages' && !missingAnswerImageGenerationTargets.length)
    )) {
      setGenerateOnlyMissingImages(false);
    }
  }, [abilitiesMissingImages.size, aiAction, generateOnlyMissingImages, missingAnswerImageGenerationTargets.length]);
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

      return { imageId, issues: failed ? image?.detectedIssues?.length ? image.detectedIssues : [`Image ${imageId} failed image QA.`] : [] };
    })).then((entries) => {
      if (active) {
        setTikzIssuesByImageId(Object.fromEntries(entries.filter(({ issues }) => issues.length).map(({ imageId, issues }) => [imageId, issues])));
      }
    }).catch(console.error);

    return () => { active = false; };
  }, [imageFixTargets, contentSnapshotKey]);
  const questionImageFixTargets = useMemo(() => imageFixTargets.filter(({ field }) => field === 'p'), [imageFixTargets]);
  const answerImageFixTargets = useMemo(() => imageFixTargets.filter(({ field }) => field === 'i'), [imageFixTargets]);
  const failedTikzTargets = useMemo(() => imageFixTargets.filter(({ imageId }) => Boolean(tikzIssuesByImageId[imageId]?.length)), [imageFixTargets, tikzIssuesByImageId]);
  const failedTikzAbilityCount = useMemo(() => new Set(failedTikzTargets.filter(({ field }) => field === 'p').map(({ record }) => record.id)).size, [failedTikzTargets]);
  const failedAnswerTikzAbilityCount = useMemo(() => new Set(failedTikzTargets.filter(({ field }) => field === 'i').map(({ record }) => record.id)).size, [failedTikzTargets]);
  const failedVisualCountsByChapter = useMemo(() => {
    const failedAbilityIds = new Set(failedTikzTargets.map(({ record }) => record.id));

    return chapterContent.map(({ abilities }) => abilities.filter(({ id }) => failedAbilityIds.has(id)).length);
  }, [chapterContent, failedTikzTargets]);
  const questionImageFixTargetsForRun = fixOnlyFailedTikz && !autoRunAll ? questionImageFixTargets.filter(({ imageId }) => Boolean(tikzIssuesByImageId[imageId]?.length)) : questionImageFixTargets;
  const answerImageFixTargetsForRun = fixOnlyFailedTikz && !autoRunAll ? answerImageFixTargets.filter(({ imageId }) => Boolean(tikzIssuesByImageId[imageId]?.length)) : answerImageFixTargets;
  const skillSources = useMemo<SkillSource[]>(() => chapterContent.flatMap(({ chapter, concepts }) => chapter.id === undefined ? [] : concepts.flatMap(({ description, id, title }) => id === undefined ? [] : [{ chapterId: chapter.id as number, chapterTitle: chapter.title, description, sourceId: id, sourceType: 'concept' as const, title }])), [chapterContent]);
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
  // Prerequisite checks must use the current Book checkpoint, not the local
  // completed-stage mirror (which is synchronized in a later React effect).
  // Otherwise Fast Forward can see a completed Refine chapters stage while
  // Abilities still appears disabled for one render.
  const stageReady = useCallback((stage: BookProcessingStageKey): boolean => isBookProcessingStageSatisfied(book, stage), [book]);
  const hasAbilities = allAbilities.length > 0;

  const completeStage = useCallback(async (stage: BookProcessingStageKey, invalidateDownstream = false): Promise<void> => {
    if (invalidateDownstream) {
      await resetBookProcessingStagesFrom(book.id, stage, { onlyMissing: true });
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

    if (aiAction === 'abilities') {
      return chapterContent.flatMap(({ chapter, concepts }) => concepts
        .filter(({ id }) => !generateOnlyMissingAbilities || id === undefined || !abilityModuleIds.has(conceptAbilityModuleId(book.id, id)))
        .map((concept) => conceptAbilityGenerationPrompt(language, chapter.title, concept, book.age)));
    }

    if (aiAction === 'fix') {
      return chapterContent.filter(({ abilities }) => abilities.length > 0).map(({ abilities, chapter }) => FIX_ABILITIES_REQUEST_PROMPT(abilityRepairInput(language, abilities, chapter.title, book.age, conceptsById)));
    }

    if (aiAction === 'images') {
      return imageGenerationTargetsForRun.flatMap(({ exerciseIndex, field, record, visualPrompt }) => record.ability
        ? [tikzRequestPrompt(language, record.ability, exerciseIndex, field, visualPrompt, book.age)]
        : []);
    }

    if (aiAction === 'answerImages') {
      return answerImageGenerationTargetsForRun.flatMap(({ exerciseIndex, record, visualPrompt }) => record.ability
        ? [answerTikzRequestPrompt(language, record.ability, exerciseIndex, visualPrompt, book.age)]
        : []);
    }

    if (aiAction === 'fixImages' || aiAction === 'fixAnswerImages') {
      const pendingPreRender: TikzPreRenderResult = { compiled: true, diagnostics: [], renderedSvg: '', texInput: '' };

      return (aiAction === 'fixImages' ? questionImageFixTargetsForRun : answerImageFixTargetsForRun).map((target) => tikzFixReviewPrompt(language, target, pendingPreRender, book.age));
    }

    return [];
  }, [abilityModuleIds, aiAction, answerImageFixTargetsForRun, answerImageGenerationTargetsForRun, book.age, book.id, chapterContent, conceptsById, generateOnlyMissingAbilities, questionImageFixTargetsForRun, imageGenerationTargetsForRun, language, skillSources]);
  const maxChapterAbilityCount = Math.max(1, ...chapterContent.map(({ abilities }) => abilities.length));
  const generationOutputTokens = aiAction === 'abilities' ? 3_200 : aiAction === 'fix' ? maxChapterAbilityCount * 700 : aiAction === 'images' || aiAction === 'answerImages' ? 2_400 : aiAction === 'fixImages' || aiAction === 'fixAnswerImages' ? TIKZ_REVIEW_MAX_OUTPUT_TOKENS : aiAction === 'skills' ? BATCH_SIZE * 180 : 300;
  const validationInputs = requestInputs;
  const outputTokens = generationOutputTokens;
  const estimate = estimateAiInput(effectiveModel, validationInputs, outputTokens);

  const deleteConceptAndAbilities = useCallback(async (conceptId: number): Promise<void> => {
    await deleteBookConcept(conceptId);
  }, []);

  const beginProgress = useCallback((label: string, total: number, stage?: BookStageSpendKey): AbortSignal => {
    processingAbortControllerRef.current?.abort();
    const controller = new AbortController();

    processingAbortControllerRef.current = controller;
    setProcessingStage(stage);
    setAiAction(undefined); setError(''); setFixReview(null); setImageFixReview(null); setNotice(''); setIsBusy(true); setOpenRouterSpent(0); setProgress(0); setProgressLabel(label); setProgressTotal(Math.max(1, total));

    return controller.signal;
  }, []);

  const endProgress = useCallback((): void => {
    processingAbortControllerRef.current = null;
    setProcessingStage(undefined);
    setIsBusy(false);
  }, []);

  const abortProcessing = useCallback((): void => {
    splitBatchCancelledRef.current = true;
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

  // Reuse the exact per-Concept creation, repair and TikZ pipeline for both
  // a single-Ability redo and every new child of a split Concept.
  const runConceptStages = useCallback(async (
    concept: BookConcept,
    chapterTitle: string,
    stages: ConceptRedoStage[],
    client: OpenAI,
    signal: AbortSignal,
    onStage: (stageIndex: number, stage: ConceptRedoStage, complete: boolean) => void
  ): Promise<void> => {
    if (concept.id === undefined) throw new Error('A saved Concept is required for Ability generation.');
    const conceptId = concept.id;
    const conceptMap = new Map([[conceptId, concept]]);

    const readAbilities = async (): Promise<StoredAbility[]> => {
      const records = await getAbilities(conceptAbilityModuleId(book.id, conceptId));

      return Promise.all(records.map(async ({ id, content, displayOrder, moduleId }): Promise<StoredAbility> => {
        const hydrated = await hydrateAbilityContent(content);

        return { ability: parseStoredAbility(hydrated), content, displayOrder, id, moduleId };
      }));
    };

    for (const [stageIndex, stage] of stages.entries()) {
      if (signal.aborted) throw new Error('Concept regeneration was cancelled.');
      onStage(stageIndex, stage, false);

      if (stage === 'abilities') {
        const runJson: AbilityWorkflowJsonRunner = (prompt, parse, options) => requestValidatedJson(
          client, effectiveModel, CONCEPT_ABILITY_WORKFLOW_SYSTEM_PROMPT(language, chapterTitle, book.age),
          prompt, parse, true, addAbilitiesCost, options?.maxOutputTokens,
          options?.repairContext, options?.validationCycles ?? 1, signal
        );
        const ability = await generateConceptAbility(language, chapterTitle, concept, runJson, book.age, signal);
        if (signal.aborted) throw new Error('Concept regeneration was cancelled.');
        await replaceAbilities(conceptAbilityModuleId(book.id, conceptId), [JSON.stringify(ability)]);
      }

      if (stage === 'fixAbilities') {
        const records = await readAbilities();

        if (!records.length || records.some(({ ability }) => !ability)) throw new Error('No valid Ability exists for this Concept. Start from Create Ability.');
        const result = await requestAbilityRepairResult(
          client, effectiveModel, REPAIR_SYSTEM_PROMPT(language, book.age),
          abilityRepairInput(language, records, chapterTitle, book.age, conceptMap),
          records, addFixAbilitiesCost, signal
        );

        if (result.unresolvedReviews?.length) throw new Error(`AI could not repair this Concept's Ability: ${result.unresolvedReviews[0].errors.join('; ')}`);
        const duplicateIds = new Set(result.duplicatePairs.map(({ deletedAbilityId }) => deletedAbilityId));
        const fixed = records.flatMap((row, index) => {
          if (duplicateIds.has(row.id)) return [];
          const replacement = result.reviews.find(({ index: reviewIndex }) => reviewIndex === index)?.ability;
          const fixedAbility = abilityWithDirectConceptTitle(replacement ?? row.ability as GeneratedAbility, row.moduleId, conceptMap);
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
        const targets = records.flatMap((row) => (row.ability as GeneratedAbility).q.flatMap((exercise, exerciseIndex) => (['p'] as const).flatMap((field) => {
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

      if (stage === 'answerImages') {
        const records = await readAbilities();
        if (!records.length || records.some(({ ability }) => !ability)) throw new Error('No valid Ability exists for this Concept.');
        await mapConcurrent(records.flatMap((row) => row.ability
          ? row.ability.q.flatMap((exercise, exerciseIndex) => {
            const prompt = exercise.iPrompt?.trim() || (!isTikzCode(exercise.i) ? exercise.i.trim() : '');
            return prompt || (isTikzCode(exercise.p) && exerciseNeedsCompletedFigure(exercise.h)) || isTikzCode(exercise.i)
              ? [{ row, exerciseIndex, visualPrompt: prompt || 'Show the correctly completed version of the question figure.' }] : [];
          }) : []), OPENROUTER_CONCURRENCY, async ({ row, exerciseIndex, visualPrompt }) => {
          const ability = row.ability as GeneratedAbility;
          const tikz = cleanTikzResponse(await requestChatContentWithTruncationRetry(
            client, effectiveModel, 'Create a synchronized answer TikZ figure. Return only a TikZ picture.',
            answerTikzRequestPrompt(language, ability, exerciseIndex, visualPrompt, book.age),
            false, addAnswerImagesCost, 2_400, signal
          ));
          if (signal.aborted) throw new Error('Concept regeneration was cancelled.');
          const imageId = await ensureAbilityAnswerImage(row.id, exerciseIndex, visualPrompt);
          const image = await getImage(imageId);
          if (!image) throw new Error(`Answer image ${imageId} not found.`);
          await putImage({ ...image, data: tikz, prompt: visualPrompt, type: 'tikz', valid: undefined });
        });
      }

      if (stage === 'fixImages' || stage === 'fixAnswerImages') {
        const records = await readAbilities();
        const targets: ImageFixTarget[] = records.flatMap((row) => row.ability
          ? row.ability.q.flatMap((exercise, exerciseIndex) => ([stage === 'fixImages' ? 'p' : 'i'] as const).flatMap((field) => {
            const imageId = storedAbilityImageId(row, exerciseIndex, field);
            const tikz = exercise[field];
            const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';

            return imageId !== undefined && isTikzCode(tikz) ? [{ ability: row.ability as GeneratedAbility, exerciseIndex, field, imageId, originalTikz: tikz, prompt: exercise[promptField]?.trim() ?? '', record: row }] : [];
          }))
          : []);
        if (records.some((row) => row.ability?.q.some((exercise, index) => ([stage === 'fixImages' ? 'p' : 'i'] as const).some((field) => {
          const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';

          return exercise[promptField]?.trim() && (!isTikzCode(exercise[field]) || storedAbilityImageId(row, index, field) === undefined);
        })))) throw new Error('Some visuals have not been generated yet. Run the corresponding image-generation stage first.');
        await mapConcurrent(targets, TIKZ_RENDER_CONCURRENCY, async (target) => {
          const review = await reviewConceptImage(target, client, effectiveModel, language, book.age, (stage === 'fixImages' ? addFixImagesCost : addFixAnswerImagesCost), signal);

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

      onStage(stageIndex, stage, true);
    }
  }, [addAbilitiesCost, addFixAbilitiesCost, addFixAnswerImagesCost, addFixImagesCost, addAnswerImagesCost, addImagesCost, book.age, book.id, effectiveModel, language]);

  // Generate replacement Concepts and their Abilities first. Only after every
  // child passes does the atomic commit delete the old Concept and Abilities.
  // A failed/cancelled generation rolls back drafts, preserving the original.
  const splitAbility = useCallback(async (record: StoredAbility, signal: AbortSignal): Promise<void> => {
    if (signal.aborted) throw new Error('Concept split was cancelled.');
    const conceptLink = /-concept-(\d+)$/.exec(record.moduleId);
    const conceptId = conceptLink ? Number(conceptLink[1]) : undefined;
    const chapterRow = conceptId === undefined ? undefined : chapterContent.find(({ concepts }) => concepts.some(({ id }) => id === conceptId));

    if (conceptId === undefined || !chapterRow) {
      throw new Error('This Ability has no linked Concept. Link it to a Concept before splitting.');
    }
    if (!language || !book.subject) throw new Error('Book language and subject must be configured before splitting a Concept.');

    // Snapshot siblings for the AI prompt. Final chapter ordering is handled
    // atomically against the LIVE inventory, after the generated children pass.
    const allPages = await getBookPages(book.id);
    const rows = await Promise.all([0, ...allPages.map(({ pageNumber }) => pageNumber)]
      .map(async (pageNumber) => ({ pageNumber, concepts: await getBookConceptsForBookPage(book.id, pageNumber) })));
    const chapterConcepts = rows.flatMap(({ pageNumber, concepts }) => concepts.filter(({ chapterId }) =>
      chapterId !== undefined
        ? chapterId === chapterRow.chapter.id
        : pageNumber !== 0 && allPages.find((page) => page.pageNumber === pageNumber)?.chapter === chapterRow.chapter.title
    ));
    const concept = chapterConcepts.find(({ id }) => id === conceptId);
    if (!concept) throw new Error('The queued Concept no longer exists in this chapter.');

    const savedChildren: BookConcept[] = [];
    let originalDeleted = false;

    try {
      const client = await createClient();
      const chapterPages = allPages.filter((page) =>
        chapterRow.chapter.id !== undefined
          ? page.chapterId === chapterRow.chapter.id || (page.chapterId === undefined && page.chapter === chapterRow.chapter.title)
          : page.chapter === chapterRow.chapter.title
      );
      const chapterMmd = chapterPages.map(({ pageMMD, pageNumber }) => `--- page ${pageNumber} ---\n${pageMMD ?? ''}`).join('\n\n');
      const siblings = chapterConcepts.filter(({ id }) => id !== conceptId);
      const children = await requestValidatedJson(
        client, effectiveModel,
        'Split compound educational Concepts into independent child objectives. Return only JSON.',
        splitConceptPrompt(chapterRow.chapter.title, chapterMmd, concept, siblings, book.subject, language, book.age),
        (json) => parseSplitConcepts(json, concept, siblings, language),
        true, (cost) => addStageCost('fixConcepts', cost), 3_200, undefined, 2, signal
      );
      if (signal.aborted) throw new Error('Concept split was cancelled.');
      const stages = conceptRedoStagesFrom('abilities');
      const fixedChildren: Array<Pick<BookConcept, 'title' | 'description'>> = [];

      for (const child of children) {
        if (signal.aborted) throw new Error('Concept split was cancelled.');
        const fixed = await requestValidatedJson(
          client, effectiveModel,
          'Review and repair exactly one educational Concept. Return only JSON.',
          fixSingleConceptPrompt(chapterRow.chapter.title, chapterMmd, child, book.subject, language, book.age),
          (json) => parseFixedConcept(json, language),
          true, (cost) => addStageCost('fixConcepts', cost), 1_500, undefined, 2, signal
        );

        if (signal.aborted) throw new Error('Concept split was cancelled.');
        fixedChildren.push(fixed);
      }

      // Fixing titles can make two formerly distinct children identical. Check
      // once more BEFORE inserting anything or generating expensive images.
      const validatedChildren = parseSplitConcepts(JSON.stringify({ concepts: fixedChildren }), concept, siblings, language);

      for (const child of validatedChildren) {
        if (signal.aborted) throw new Error('Concept split was cancelled.');
        const saved = await createBookConcept({
          bookPage: concept.bookPage,
          chapterId: concept.chapterId ?? chapterRow.chapter.id,
          title: child.title,
          description: child.description
        });

        savedChildren.push(saved);
      }

      for (const child of savedChildren) {
        await runConceptStages(child, chapterRow.chapter.title, stages, client, signal, () => undefined);
      }

      if (signal.aborted) throw new Error('Concept split was cancelled.');
      // Concurrent workers may finish in any order, even within a chapter.
      // Replace the parent and order children in one IndexedDB transaction.
      await replaceBookConceptWithChildren(conceptId, savedChildren.flatMap(({ id }) => id === undefined ? [] : [id]));
      originalDeleted = true;
      // The new child Abilities are AI updates and need a reviewable audit entry.
      for (const child of savedChildren) {
        if (child.id === undefined) continue;
        for (const row of await getAbilities(conceptAbilityModuleId(book.id, child.id))) {
          const updatedAbility = parseStoredAbility(await hydrateAbilityContent(row.content));
          await addBookAbilityChangeLog({ bookId: book.id, conceptId: child.id,
            recordId: row.id, title: updatedAbility.h, source: 'ai', summary: `AI split Concept ${concept.title} and generated this Ability` });
        }
      }
      await onAbilityLogChange?.();
    } catch (error) {
      if (!originalDeleted) {
        const rollback = await Promise.allSettled(savedChildren.flatMap(({ id }) => id === undefined ? [] : [deleteBookConcept(id)]));

        if (rollback.some(({ status }) => status === 'rejected')) {
          throw new Error(`${error instanceof Error ? error.message : 'Concept split failed.'} Some draft children could not be removed; check this chapter before retrying.`);
        }
      }
      throw error;
    }
  }, [addStageCost, book.age, book.id, book.subject, chapterContent, createClient, effectiveModel, language, runConceptStages, onAbilityLogChange]);

  // Estimate against the actual queued Concepts and their source chapters. The
  // number of child Concepts and visual requests is unknown until AI responds;
  // two children with two potential exercises per child is our planning basis.
  useEffect(() => {
    if (!isSplitQueueConfirmationOpen || queuedWorkItems.length === 0) return;
    let active = true;

    const estimateQueue = async (): Promise<void> => {
      if (!language) throw new Error('Set the book language before running queued jobs.');
      if (queuedSplitIds.length && !book.subject) throw new Error('Set the book subject before splitting.');
      const pages = await getBookPages(book.id);
      const requests: AiRequestEstimate[] = [];

      for (const conceptId of queuedSplitIds) {
        const chapterRow = chapterContent.find(({ concepts }) => concepts.some(({ id }) => id === conceptId));
        const concept = chapterRow?.concepts.find(({ id }) => id === conceptId);
        if (!concept || !chapterRow) throw new Error(`Queued Concept ${conceptId} was not found. Refresh the book.`);
        const chapterPages = pages.filter((page) => page.chapterId === chapterRow.chapter.id || (page.chapterId === undefined && page.chapter === chapterRow.chapter.title));
        const chapterMmd = chapterPages.map(({ pageMMD, pageNumber }) => `--- page ${pageNumber} ---\n${pageMMD ?? ''}`).join('\n\n');
        const siblings = chapterRow.concepts.filter(({ id }) => id !== conceptId);
        requests.push({ input: splitConceptPrompt(chapterRow.chapter.title, chapterMmd, concept, siblings, book.subject, language, book.age), outputTokens: 3_200 });

        const record = chapterRow.abilities.find(({ moduleId }) => moduleId === conceptAbilityModuleId(book.id, conceptId));
        const exampleVisualSource = JSON.stringify(record?.ability?.q ?? []);
        for (let childIndex = 0; childIndex < 2; childIndex++) {
          const draftChild = { title: `${concept.title} — ${childIndex + 1}`, description: concept.description };
          requests.push({ input: fixSingleConceptPrompt(chapterRow.chapter.title, chapterMmd, draftChild, book.subject, language, book.age), outputTokens: 1_500 });
          requests.push({ input: conceptAbilityGenerationPrompt(language, chapterRow.chapter.title, draftChild, book.age), outputTokens: 3_200 });
          requests.push({ input: `Repair the generated Ability for ${JSON.stringify(draftChild)}. ${exampleVisualSource}`, outputTokens: 1_800 });
          // Generated exercise visuals are conditional. Include two question
          // and two answer images, with one visual review each, per child.
          for (let exerciseIndex = 0; exerciseIndex < 2; exerciseIndex++) {
            const visualPrompt = `Generate educational TikZ for ${draftChild.title}, exercise ${exerciseIndex + 1}: ${exampleVisualSource}`;
            requests.push({ input: visualPrompt, outputTokens: 2_400 });
            requests.push({ input: `Review question TikZ: ${visualPrompt}`, outputTokens: 6_000 });
            requests.push({ input: `Generate answer figure: ${visualPrompt}`, outputTokens: 2_400 });
            requests.push({ input: `Review answer TikZ: ${visualPrompt}`, outputTokens: 6_000 });
          }
        }
      }

      for (const item of queuedWorkItems) {
        if (item.kind !== 'fix' || !item.instructions) continue;
        const instructions = effectiveAbilityFixInstructions(item.instructions);
        const moduleId = conceptAbilityModuleId(book.id, item.conceptId);
        const storedRecords = await getAbilities(moduleId);
        const stored = storedRecords.find(({ id }) => id === item.recordId) ?? (storedRecords.length === 1 ? storedRecords[0] : undefined);
        if (!stored) throw new Error(`Queued Ability for Concept ${item.conceptId} was not found.`);
        const ability = parseStoredAbility(await hydrateAbilityContent(stored.content));
        const plan = planAbilityFix(instructions, ability);
        if (plan.regenerateText) {
          requests.push({ input: `Regenerate Ability from feedback: ${JSON.stringify(instructions)}\n${JSON.stringify(ability)}`, outputTokens: 3_200 });
        }
        // Estimates and execution must use the SAME work plan. Question
        // generation/QA always precedes answer generation/QA; each answer is
        // based on the verified question TikZ, not the original drawing.
        for (const exerciseIndex of plan.questionImages) {
          const exercise = ability.q[exerciseIndex];
          const visualPrompt = exercise.pPrompt?.trim() || `Draw a question diagram for: ${exercise.h}`;
          requests.push({ input: tikzRequestPrompt(language, ability, exerciseIndex, 'p', visualPrompt, book.age), outputTokens: 2_400 });
          requests.push({ input: `Render and visually review question ${exerciseIndex + 1}: ${visualPrompt}`, outputTokens: TIKZ_REVIEW_MAX_OUTPUT_TOKENS });
        }
        for (const exerciseIndex of plan.answerImages) {
          const exercise = ability.q[exerciseIndex];
          const visualPrompt = exercise.iPrompt?.trim() || `Show the completed question figure for: ${exercise.a}`;
          requests.push({ input: answerTikzRequestPrompt(language, ability, exerciseIndex, visualPrompt, book.age), outputTokens: 2_400 });
          requests.push({ input: `Render and visually review answer ${exerciseIndex + 1}: ${visualPrompt}`, outputTokens: TIKZ_REVIEW_MAX_OUTPUT_TOKENS });
        }
      }
      if (active) setSplitQueueEstimateState({ key: splitEstimateKey, estimate: estimateAiRequests(effectiveModel, requests) });
    };

    void estimateQueue().catch((error: unknown) => {
      if (active) setSplitQueueEstimateState({ key: splitEstimateKey, estimate: error instanceof Error ? error.message : 'Unable to estimate split costs.' });
    });
    return () => { active = false; };
  }, [isSplitQueueConfirmationOpen, queuedSplitIds, queuedWorkItems, chapterContent, book.id, book.subject, book.age, language, effectiveModel, splitEstimateKey]);

  /** Use the same plan as the estimate. Full Fix regenerates both exercises,
   * then question diagrams + QA, then answers FROM those verified questions. */
  const fixQueuedAbility = useCallback(async (item: BookAbilityWorkItem, signal: AbortSignal): Promise<void> => {
    if (item.kind !== 'fix' || !item.instructions) throw new Error('Missing scheduled Ability correction.');
    if (!language) throw new Error('Set the book language before fixing an Ability.');
    const instructions = effectiveAbilityFixInstructions(item.instructions);
    const moduleId = conceptAbilityModuleId(book.id, item.conceptId);
    const liveJob = (await getBookAbilityWorkQueue(book.id)).find(({ id }) => id === item.id);
    const existing = await getAbilities(moduleId);
    const stored = existing.find(({ id }) => id === (liveJob?.recordId ?? item.recordId)) ?? (existing.length === 1 ? existing[0] : undefined);
    if (!stored) throw new Error('Queued Ability no longer exists. Remove or reschedule this job.');
    const originalAbility = parseStoredAbility(await hydrateAbilityContent(stored.content));
    const plan = planAbilityFix(instructions, originalAbility);
    const client = await createClient();
    let recordId = stored.id;
    let ability = originalAbility;

    if (plan.regenerateText) {
      const corrected = await requestValidatedJson(
        client, effectiveModel,
        'You are an expert educational Ability editor. Return only one JSON Ability object of the same schema; do not return markdown. Preserve everything not requested.',
        `Regenerate this Ability using the correction instructions. It must retain t:3, i, h and exactly two exercises in q. Each exercise has h, a, p, i, pPrompt and iPrompt as applicable. The two exercises must have DISTINCT questions (not copies or trivial rewordings of each other), with their own correct answers. The output MUST make a visible change to every specifically requested text field. ${plan.fullRegeneration ? 'Regenerate the ENTIRE Ability: create TWO substantially new exercises, with new questions and correct matching answers. Both exercises MUST be different from their originals. Generate fresh, detailed pPrompt and iPrompt descriptions for the NEW questions and answers. Do not include any TikZ source code; set p and i to empty strings because figures will be generated in separate subsequent requests.' : 'Preserve fields not requested for changes, including any existing image sources, except update visual specifications to match rewritten text.'} Follow ONLY the instructions below.\nBook language: ${language}\nLearner age: ${book.age ?? 'unspecified'}\nOriginal Ability:\n${JSON.stringify(originalAbility)}\n${instructions.overall ? `Whole-Ability correction:\n${instructions.overall}` : instructions.regenerateExercises ? `Regenerate both exercises. Incorporate these existing errors and image notes:\n${JSON.stringify(Object.fromEntries(ABILITY_FIX_FIELDS.filter(({ key }) => instructions[key].trim()).map(({ key }) => [key, instructions[key]])))}` : `Corrections by field:\n${JSON.stringify(Object.fromEntries(ABILITY_FIX_FIELDS.filter(({ image, key }) => !image && instructions[key].trim()).map(({ key }) => [key, instructions[key]])))}`}`,
        (response) => assertAbilityFixResultChanged(originalAbility, parseStoredAbility(response), { ...instructions, regenerateExercises: plan.fullRegeneration }), true, addFixAbilitiesCost, 3_200, undefined, 3, signal
      );
      if (signal.aborted) throw new Error('Ability correction cancelled.');
      // Full regeneration must not retain figures that describe old questions.
      ability = plan.fullRegeneration ? prepareRegeneratedAbilityVisuals(corrected, originalAbility) : corrected;
      recordId = await replaceAbility(stored.id, JSON.stringify(ability));
    }

    const liveRecord = async (): Promise<StoredAbility> => {
      const row = (await getAbilities(moduleId)).find(({ id }) => id === recordId);
      if (!row) throw new Error('Corrected Ability disappeared before image repair.');
      const hydrated = await hydrateAbilityContent(row.content);
      return { ...row, ability: parseStoredAbility(hydrated) };
    };

    const regenerateImage = async (exerciseIndex: number, imageField: 'p' | 'i'): Promise<void> => {
      if (signal.aborted) throw new Error('Ability image correction cancelled.');
      const current = await liveRecord();
      const exercise = current.ability?.q[exerciseIndex];
      if (!exercise) throw new Error(`Exercise ${exerciseIndex + 1} was not found.`);
      if (imageField === 'i' && !isTikzCode(exercise.p)) {
        throw new Error(`Exercise ${exerciseIndex + 1}: generate and verify the question image before its answer image.`);
      }
      const promptField = imageField === 'p' ? 'pPrompt' : 'iPrompt';
      const noteField = `exercise${exerciseIndex + 1}${imageField === 'p' ? 'QuestionImage' : 'AnswerImage'}` as 'exercise1QuestionImage' | 'exercise1AnswerImage' | 'exercise2QuestionImage' | 'exercise2AnswerImage';
      const repairNote = instructions[noteField].trim();
      const existingPrompt = exercise[promptField]?.trim() || (!isTikzCode(exercise[imageField]) ? exercise[imageField].trim() : '');
      const visualPrompt = existingPrompt || (imageField === 'p'
        ? `Draw a question diagram suitable for: ${exercise.h}. Do not reveal the solution.`
        : `Show the correctly completed question diagram for: ${exercise.h}. Answer: ${exercise.a}`);
      const imagePrompt = `${visualPrompt}${repairNote ? `\nCorrections requested: ${repairNote}` : ''}`;
      let imageId = storedAbilityImageId(current, exerciseIndex, imageField);
      if (imageId === undefined) imageId = imageField === 'p'
        ? await ensureAbilityQuestionImage(recordId, exerciseIndex, visualPrompt)
        : await ensureAbilityAnswerImage(recordId, exerciseIndex, visualPrompt);
      const image = await getImage(imageId);
      if (!image) throw new Error(`Image ${imageId} no longer exists.`);
      const previousErrors = [...new Set([...(image.detectedIssues ?? []), ...(image.reviewResult?.errors ?? [])])];
      const correctedPrompt = previousErrors.length ? `${imagePrompt}\nPreviously detected issues: ${previousErrors.join('; ')}` : imagePrompt;
      const source = cleanTikzResponse(await requestChatContentWithTruncationRetry(
        client, effectiveModel,
        'Produce one complete, accurate, browser-renderable educational TikZ figure. Return only one TikZ picture.',
        imageField === 'p'
          ? tikzRequestPrompt(language, current.ability as GeneratedAbility, exerciseIndex, 'p', correctedPrompt, book.age)
          : answerTikzRequestPrompt(language, current.ability as GeneratedAbility, exerciseIndex, correctedPrompt, book.age),
        false, imageField === 'p' ? addImagesCost : addAnswerImagesCost, 2_400, signal
      ));
      if (signal.aborted) throw new Error('Ability image correction cancelled.');
      if (!isTikzCode(source)) throw new Error('Image generation did not return valid TikZ.');
      await putImage({ ...image, data: source, prompt: visualPrompt, type: 'tikz', valid: undefined });
      const refreshed = await liveRecord();
      const target: ImageFixTarget = {
        ability: refreshed.ability as GeneratedAbility, record: refreshed,
        exerciseIndex, field: imageField, imageId, originalTikz: source,
        prompt: visualPrompt // Previous issues are already included in generation, not fed into a redundant first repair.
      };
      const review = await reviewConceptImage(target, client, effectiveModel, language, book.age,
        imageField === 'p' ? addFixImagesCost : addFixAnswerImagesCost, signal);
      if (review.unresolved) throw new Error(`Image ${imageId} failed visual QA: ${review.unresolved.errors.join('; ')}`);
      if (review.item) {
        const latest = await getImage(imageId);
        if (!latest || latest.data !== source) throw new Error('Image changed during review; discarding stale correction.');
        await putImage({ ...latest, data: review.item.fixedTikz, valid: true, type: 'tikz',
          sourceVersion: review.item.finalReviewResult.sourceVersion, renderStatus: 'passed', visualQaStatus: 'passed',
          detectedIssues: [], reviewResult: review.item.finalReviewResult }, source);
      }
    };

    // Never generate an answer from an old/unfinished question figure. A
    // question QA fix can change coordinates, so hydrate it again for answers.
    for (const exerciseIndex of plan.questionImages) await regenerateImage(exerciseIndex, 'p');
    for (const exerciseIndex of plan.answerImages) await regenerateImage(exerciseIndex, 'i');

    if (signal.aborted) throw new Error('Ability correction cancelled.');
    await addBookAbilityChangeLog({ bookId: book.id, conceptId: item.conceptId, recordId,
      title: ability.h, source: 'ai',
      summary: plan.fullRegeneration ? 'AI regenerated Ability and synchronized question/answer images' : plan.regenerateText ? 'AI corrected Ability text and selected images' : 'AI repaired selected images' });
    await onAbilityLogChange?.();
  }, [addAnswerImagesCost, addFixAbilitiesCost, addFixAnswerImagesCost, addFixImagesCost, addImagesCost, book.age, book.id, createClient, effectiveModel, language, onAbilityLogChange]);

  const runSplitQueue = useCallback(async (): Promise<void> => {
    if (splitBatchRunningRef.current || processingAbortControllerRef.current || isBusy || autoRunAll || externalAutoRunBusy || externalSplitQueueBusy || queuedWorkItems.length === 0 || !splitQueueEstimate || typeof splitQueueEstimate === 'string') return;
    splitBatchRunningRef.current = true;
    splitBatchCancelledRef.current = false;
    onSplitQueueBusyChange?.(true);
    onCloseSplitQueueConfirmation?.();
    // Fixes run before splits for the same Concept; unrelated Concepts stay parallel.
    const pending = [...queuedWorkItems].sort((a, b) => a.conceptId === b.conceptId ? (a.kind === b.kind ? 0 : a.kind === 'fix' ? -1 : 1) : 0);
    const signal = beginProgress(`Processing ${pending.length} queued Ability jobs in parallel`, pending.length);
    let finished = 0;
    let completed = 0;
    let failed = 0;

    try {
      // Different Concepts run in parallel; same-Concept jobs are serialized
      // to prevent a split from deleting an Ability while a fix is writing it.
      const conceptTails = new Map<number, Promise<void>>();
      const jobs = pending.map((item) => {
        const predecessor = conceptTails.get(item.conceptId) ?? Promise.resolve();
        const task = predecessor.then(async (): Promise<string | undefined> => {
          if (signal.aborted) return undefined;
          try {
            if (item.kind === 'split') {
              const chapterRow = chapterContent.find(({ concepts }) => concepts.some(({ id }) => id === item.conceptId));
              const record = chapterRow?.abilities.find(({ moduleId }) => moduleId === conceptAbilityModuleId(book.id, item.conceptId));
              if (!record) throw new Error(`Queued Ability for Concept ${item.conceptId} was not found.`);
              await splitAbility(record, signal);
            } else {
              await fixQueuedAbility(item, signal);
            }
            await onWorkQueueItemComplete?.(item.id);
            completed++;
            return undefined;
          } catch (error) {
            if (!signal.aborted) failed++;
            return `${item.id}: ${error instanceof Error ? error.message : String(error)}`;
          } finally {
            finished++;
            setProgress(finished);
            setProgressLabel(`Work ${finished}/${pending.length} processed (${completed} successful, ${failed} failed)`);
          }
        });
        conceptTails.set(item.conceptId, task.then(() => undefined, () => undefined));
        return task;
      });
      const results = await Promise.allSettled(jobs);

      const failures = results.flatMap((result, index): string[] => {
        if (result.status === 'rejected') {
          if (!signal.aborted) failed++;
          return [`${pending[index].id}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`];
        }
        return result.value ? [result.value] : [];
      });

      if (signal.aborted || splitBatchCancelledRef.current) {
        setNotice(`Ability work batch cancelled: ${completed} completed. Unfinished Abilities remain queued.`);
      } else if (failures.length) {
        setError(`Processed ${completed} of ${pending.length} Abilities. ${failed} failed and remain queued. First error: ${failures[0]}`);
      } else {
        setNotice(`Completed ${completed} queued ${completed === 1 ? 'Ability' : 'Abilities'} successfully.`);
      }
    } catch (error) {
      setError(`Ability work batch failed: ${error instanceof Error ? error.message : String(error)}. Remaining Abilities stay queued.`);
    } finally {
      splitBatchRunningRef.current = false;
      try { refreshContent(); } finally {
        endProgress();
        onSplitQueueBusyChange?.(false);
      }
    }
  }, [autoRunAll, beginProgress, book.id, chapterContent, endProgress, externalAutoRunBusy, externalSplitQueueBusy, isBusy, onCloseSplitQueueConfirmation, onWorkQueueItemComplete, onSplitQueueBusyChange, queuedWorkItems, fixQueuedAbility, refreshContent, splitAbility, splitQueueEstimate]);

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

  const generateAbilities = useCallback(async (): Promise<void> => {
    // A Concept can only generate one Ability, even if it occurs twice in the
    // loaded chapter inventory (for example after an older import).
    const selectedConcepts = generateOnlyMissingAbilities ? conceptsMissingAbilities : allConcepts;
    const targets = [...new Map(selectedConcepts.map((concept) => [concept.id, concept])).values()];
    const signal = beginProgress('Generating Abilities from Concepts', targets.length, 'abilities');

    try {
      if (!allConcepts.length) throw new Error('No Concepts are available to generate Abilities from.');
      if (!targets.length) throw new Error('No Concepts are missing Abilities.');
      if (targets.some(({ id }) => id === undefined)) throw new Error('Every Concept must be saved before generating Abilities.');
      if (!generateOnlyMissingAbilities) {
        await resetBookProcessingStagesFrom(book.id, 'abilities');
      }
      const client = await createClient();
      const pending = new Set(targets.map(({ id }) => id as number));
      const generated = new Map<number, GeneratedAbility>();
      let lastError = '';
      const maxAttempts = 3;

      for (let attempt = 1; attempt <= maxAttempts && pending.size; attempt++) {
        const sourcesByConceptId = new Map<number, { chapterTitle: string; concept: BookConcept }>();

        for (const { chapter, concepts } of chapterContent) {
          for (const concept of concepts) {
            if (concept.id !== undefined && pending.has(concept.id) && !sourcesByConceptId.has(concept.id)) {
              sourcesByConceptId.set(concept.id, { chapterTitle: chapter.title, concept });
            }
          }
        }

        const sources = [...sourcesByConceptId.values()];
        await mapConcurrent(sources, OPENROUTER_CONCURRENCY, async ({ chapterTitle, concept }) => {
          const runJson: AbilityWorkflowJsonRunner = (prompt, parse, options) => requestValidatedJson(
            client, effectiveModel, CONCEPT_ABILITY_WORKFLOW_SYSTEM_PROMPT(language, chapterTitle, book.age),
            prompt, parse, true, addAbilitiesCost,
            options?.maxOutputTokens, options?.repairContext, options?.validationCycles ?? 1, signal
          );
          try {
            const ability = await generateConceptAbility(language, chapterTitle, concept, runJson, book.age, signal);
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
      // Old Ability rows have been deleted for a full run. Only missing-only
      // retries may count pre-existing Abilities as successful stage output.
      const hasAbilitiesAfterRun = generated.size > 0 || (generateOnlyMissingAbilities && allAbilities.length > 0);

      if (generated.size && generateOnlyMissingAbilities) {
        await invalidateBookProcessingStages(book.id, ['fixAbilities', 'images', 'fixImages', 'answerImages', 'fixAnswerImages']);
      }
      if (hasAbilitiesAfterRun) await completeStage(ABILITIES_STAGE);
      refresh();
      onContentChange?.();
      if (hasAbilitiesAfterRun) onAction?.('preExercisesExercises');
      if (pending.size) {
        const detail = lastError ? ` Last attempt: ${lastError}` : '';
        if (!hasAbilitiesAfterRun) setError(`No Abilities were generated after ${maxAttempts} attempts.${detail}`);
        else setNotice(`Generated Abilities for ${generated.size} of ${targets.length} Concepts; ${pending.size} remained unchanged.${detail}`);
      }
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to generate Abilities.');
    } finally {
      endProgress();
    }
  }, [addAbilitiesCost, allAbilities.length, allConcepts, beginProgress, book.age, book.id, chapterContent, completeStage, createClient, effectiveModel, endProgress, conceptsMissingAbilities, generateOnlyMissingAbilities, language, onAction, onContentChange, refresh]);

  const fixAbilities = useCallback(async (): Promise<void> => {
    const signal = beginProgress('Fixing Ability errors', allAbilities.length, 'fixAbilities');

    try {
      const client = await createClient();
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
          abilityRepairInput(language, batch, chapterTitle, book.age, conceptsById),
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

          const deletedConceptMatch = /-concept-(\d+)$/.exec(deleted.moduleId);
          const keptConceptMatch = /-concept-(\d+)$/.exec(kept.moduleId);
          const deletedConceptId = deletedConceptMatch ? Number(deletedConceptMatch[1]) : undefined;
          const deletedConcept = deletedConceptId === undefined ? undefined : conceptsById.get(deletedConceptId);
          const keptConcept = keptConceptMatch ? conceptsById.get(Number(keptConceptMatch[1])) : undefined;

          duplicatePairs.set(deletedAbilityId, {
            chapterTitle,
            deleted,
            deletedConceptId,
            deletedConceptTitle: deletedConcept?.title,
            kept,
            keptConceptTitle: keptConcept?.title
          });
        });
        result.reviews.forEach((review) => {
          if (review.hasErrors && review.ability) {
            const record = batch[review.index];

            // Duplicate copies are deleted after the review phase, so do not
            // spend a write replacing a record that is about to disappear.
            if (!batchDuplicateIds.has(record.id)) {
              replacements.set(record.id, { ability: abilityWithDirectConceptTitle(review.ability, record.moduleId, conceptsById), errors: review.errors, record });
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
          const corrected = abilityWithDirectConceptTitle(existing?.ability ?? record.ability, record.moduleId, conceptsById);

          if (corrected.h !== record.ability.h) {
            replacements.set(record.id, { ability: corrected, errors: [...(existing?.errors ?? []), 'Title must match its source Concept.'], record });
          }
        }
      });
      duplicateIds.forEach((id) => {
        replacements.delete(id);
        unresolved.delete(id);
      });

      // A completed review with no persistable changes is still successful.
      // In particular, exhausted brevity-only retries leave existing Abilities
      // untouched and must not require a manual Apply click to checkpoint the
      // Fix abilities stage (including during Fast Forward).
      if (!replacements.size && !duplicatePairs.size && !unresolved.size) {
        await completeStage(FIX_ABILITIES_STAGE);
        setNotice(`Fix abilities completed: ${allAbilities.length} checked; all Abilities retained unchanged.`);
        refresh();
        onContentChange?.();
        onAction?.('preExercisesExercises');

        return;
      }

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
          conceptTitle: (() => { const match = /-concept-(\d+)$/.exec(record.moduleId); return match ? conceptsById.get(Number(match[1]))?.title : undefined; })(),
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
  }, [addFixAbilitiesCost, allAbilities.length, beginProgress, book.age, endProgress, chapterContent, completeStage, conceptsById, createClient, language, effectiveModel, onAction, onContentChange, refresh]);

  const closeFixReview = useCallback((): void => {
    setFixReview(null);
    setNotice('Proposed Ability changes were discarded. No database changes were made.');
  }, []);
  const applyAbilityFixReview = useCallback(async (): Promise<void> => {
    if (!fixReview) {
      return;
    }

    setIsBusy(true);
    setError('');
    // AI auditing is complete at this point, but writes and stage completion
    // are still running. Do not leave the modal showing a misleading 100%.
    setProgressLabel('Applying Ability corrections');
    setProgress(0);
    setProgressTotal(Math.max(1, fixReview.items.length + fixReview.duplicatePairs.length + 1));

    try {
      const duplicateConceptIds = new Set(fixReview.duplicatePairs.flatMap(({ deletedConceptId }) => deletedConceptId === undefined ? [] : [deletedConceptId]));
      let fixed = 0;

      for (const { ability, record } of fixReview.items) {
        // Do not rewrite an Ability whose source Concept is being removed.
        const conceptMatch = /-concept-(\d+)$/.exec(record.moduleId);

        if (conceptMatch && duplicateConceptIds.has(Number(conceptMatch[1]))) {
          continue;
        }

        // Book processing (individual stages and Fast Forward) is not an
        // Ability change-log event. Only explicit queued AI fixes/splits are logged.
        await replaceAbility(record.id, JSON.stringify(ability));
        fixed += 1;
        setProgress((current) => current + 1);
      }

      // A duplicate Concept-linked Ability removes its source Concept too.
      for (const conceptId of duplicateConceptIds) {
        await deleteConceptAndAbilities(conceptId);
      }

      // Remove any duplicate Ability whose Concept link is absent.
      for (const { deleted, deletedConceptId } of fixReview.duplicatePairs) {
        if (deletedConceptId === undefined) {
          await deleteAbility(deleted.id);
        }
      }

      const hasChanges = fixReview.items.length > 0 || fixReview.duplicatePairs.length > 0;

      // Persist every valid correction, but keep unresolved Abilities unchanged.
      // An unsuccessful targeted AI retry must not block Fast Forward or force
      // manual review: Images can use the original stored Ability as-is.
      if (hasChanges) {
        await invalidateBookProcessingStages(book.id, ['images', 'fixImages', 'answerImages', 'fixAnswerImages']);
      }
      if (hasChanges || !stageDone(FIX_ABILITIES_STAGE)) {
        await completeStage(FIX_ABILITIES_STAGE);
      }

      const deleted = fixReview.duplicatePairs.length;
      await onAbilityLogChange?.();

      setProgress(Math.max(1, fixReview.items.length + fixReview.duplicatePairs.length + 1));
      setFixReview(null);
      setNotice(`Applied Fix abilities review: ${fixed} corrected, ${deleted} duplicate${deleted === 1 ? '' : 's'} deleted with their linked Concept${deleted === 1 ? '' : 's'}.${fixReview.unresolved.length ? ` ${fixReview.unresolved.length} unresolved Ability ${fixReview.unresolved.length === 1 ? 'record was' : 'records were'} kept unchanged; processing continues.` : ''}`);
      refresh();
      onContentChange?.();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to apply Fix abilities changes.');
    } finally {
      setIsBusy(false);
    }
  }, [book.id, deleteConceptAndAbilities, fixReview, onAbilityLogChange, onAction, onContentChange, refresh, completeStage, stageDone]);
  const openAbilityGeneration = useCallback((): void => {
    setGenerateOnlyMissingAbilities(conceptsMissingAbilities.length > 0 && conceptsMissingAbilities.length < allConcepts.length);
    setAiAction('abilities');
  }, [allConcepts.length, conceptsMissingAbilities.length]);
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
    const signal = beginProgress('Generating question images', targets.length, 'images');
    let completed = 0;

    try {
      if (generateOnlyMissingImages && !targets.length) {
        throw new Error('No Abilities are missing question images.');
      }

      if (!generateOnlyMissingImages) {
        await resetBookProcessingStagesFrom(book.id, 'images');
      }

      if (!targets.length) {
        await completeStage(IMAGES_STAGE, true);
        setNotice('Question Images complete: no question visuals need generation.');
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
      setNotice(`Question Images complete: converted ${targets.length} visual prompt${targets.length === 1 ? '' : 's'} to images${generateOnlyMissingImages ? ` for ${abilitiesMissingImages.size} ${abilitiesMissingImages.size === 1 ? 'Ability' : 'Abilities'} with missing question images` : ''}.`);
      refreshContent();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      if (completed > 0) {
        // Successful requests are persisted one-by-one. Reload them after a
        // partial failure/abort so the missing-images rerun only retries gaps.
        refreshContent();
      }

      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Unable to generate Ability images.');
      }
    } finally {
      endProgress();
    }
  }, [abilitiesMissingImages.size, addImagesCost, beginProgress, book.age, endProgress, completeStage, createClient, effectiveModel, generateOnlyMissingImages, imageGenerationTargetsForRun, language, onAction, refreshContent]);
  const completeAnswerImagesStage = useCallback(async (): Promise<void> => {
    const targets = answerImageGenerationTargetsForRun;
    const signal = beginProgress('Generating answer images', targets.length, 'answerImages');
    let completed = 0;

    try {
      if (generateOnlyMissingImages && !targets.length) throw new Error('No Abilities are missing answer images.');
      if (!generateOnlyMissingImages) await resetBookProcessingStagesFrom(book.id, 'answerImages');

      if (targets.length) {
        const client = await createClient();

        await mapConcurrent(targets, OPENROUTER_CONCURRENCY, async ({ exerciseIndex, record, visualPrompt }) => {
          if (!record.ability) return;
          // The question source is included in the prompt so an answer can
          // modify the same figure instead of inventing different geometry.
          const tikz = cleanTikzResponse(await requestChatContentWithTruncationRetry(
            client, effectiveModel,
            'Generate a precise TikZ solution diagram, modifying the supplied question TikZ wherever the task requires it.',
            answerTikzRequestPrompt(language, record.ability, exerciseIndex, visualPrompt, book.age),
            false, addAnswerImagesCost, 2_400, signal
          ));
          if (signal.aborted) throw new DOMException('Answer image generation cancelled.', 'AbortError');
          const sourceId = storedAbilityImageId(record, exerciseIndex, 'p');
          const currentQuestion = sourceId === undefined ? undefined : await getImage(sourceId);
          if (sourceId !== undefined && currentQuestion?.data !== record.ability.q[exerciseIndex].p) {
            throw new Error('Question TikZ changed during answer generation; rerun Answer images to keep the figures synchronized.');
          }
          const imageId = await ensureAbilityAnswerImage(record.id, exerciseIndex, visualPrompt);
          const image = await getImage(imageId);

          if (!image) throw new Error(`Answer image ${imageId} was not found.`);
          await putImage({ ...image, data: tikz, type: 'tikz', prompt: visualPrompt, valid: undefined });
          completed++;
          setProgress(completed);
        });
      }

      await completeStage(ANSWER_IMAGES_STAGE, true);
      setNotice(`Answer images complete: generated ${completed} synchronized answer diagram${completed === 1 ? '' : 's'}.`);
      refreshContent();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      if (completed) refreshContent();
      if (!signal.aborted) setError(caught instanceof Error ? caught.message : 'Unable to generate answer images.');
    } finally {
      endProgress();
    }
  }, [addAnswerImagesCost, answerImageGenerationTargetsForRun, beginProgress, book.age, book.id, completeStage, createClient, effectiveModel, endProgress, generateOnlyMissingImages, language, onAction, refreshContent]);
  const fixImages = useCallback(async (stage: 'fixImages' | 'fixAnswerImages'): Promise<void> => {
    const targets = stage === 'fixImages' ? questionImageFixTargetsForRun : answerImageFixTargetsForRun;
    const stageName = stage === 'fixImages' ? 'Fix question images' : 'Fix answer images';
    const signal = beginProgress(`Reviewing ${stageName} TikZ`, targets.length, stage);
    const reportCost = stage === 'fixImages' ? addFixImagesCost : addFixAnswerImagesCost;

    try {
      if (!targets.length) {
        if (autoRunAll) {
          await completeStage(stage);
          setNotice(`${stageName} finished: no images needed review.`);
          refreshContent();
        } else {
          setImageFixReviewStage(stage);
          setImageFixReview({ checked: 0, renderFailures: 0, items: [], unresolved: [] });
          setNotice(`There are no images matching this ${stageName} run.`);
        }
        return;
      }

      const client = await createClient();
      let completed = 0;
      const reviewTargets = async (batch: ImageFixTarget[]) => mapConcurrent(batch, TIKZ_RENDER_CONCURRENCY, async (target) => {
        const review = await reviewConceptImage(target, client, effectiveModel, language, book.age, reportCost, signal);

        completed += 1;
        setProgress(completed);

        return review;
      });
      const reviewResults = await reviewTargets(targets);
      const renderFailures = reviewResults.filter(({ renderFailure }) => renderFailure).length;
      const items = reviewResults.flatMap(({ item }) => item ? [item] : []);
      let unresolved = reviewResults.flatMap(({ unresolved }) => unresolved ? [unresolved] : []);

      if (!autoRunAll) {
        setImageFixReviewStage(stage);
        setImageFixReview({ checked: targets.length, renderFailures, items, unresolved });
        const cleanUnchanged = Math.max(0, targets.length - items.length - unresolved.length);

        setNotice(`${stageName} QA: ${items.length} PNG-reviewed correction${items.length === 1 ? '' : 's'}, ${cleanUnchanged} approved unchanged, ${unresolved.length} flagged for later retry. No proposed source changes have been applied.`);
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

      // Immediately after the active image QA stage, run one focused pass using ONLY
      // images that failed. Do not waste AI calls on visuals already approved.
      if (unresolved.length) {
        const failedIds = new Set(unresolved.map(({ imageId }) => imageId));
        const retryTargets = targets.filter(({ imageId }) => failedIds.has(imageId));

        setProgressLabel(`Retrying ${retryTargets.length} failed image${retryTargets.length === 1 ? '' : 's'}`);
        setProgressTotal(targets.length + retryTargets.length);
        const retryResults = await reviewTargets(retryTargets);

        await applyApproved(retryResults.flatMap(({ item }) => item ? [item] : []));
        unresolved = retryResults.flatMap(({ unresolved }) => unresolved ? [unresolved] : []);
      }

      // QA failures are warnings, not a stage failure. Flagged Image rows
      // remain visible and Fast Forward can proceed with later stages.
      await completeStage(stage, changed > 0);
      setNotice(`${stageName} finished: ${changed} approved correction${changed === 1 ? '' : 's'} applied; ${unresolved.length} visual${unresolved.length === 1 ? '' : 's'} still flagged for manual review. Fast Forward will continue.`);
      refreshContent();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      if (!signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Unable to review and fix images.');
      }
      refreshContent();
    } finally {
      endProgress();
    }
  }, [addFixAnswerImagesCost, addFixImagesCost, answerImageFixTargetsForRun, autoRunAll, beginProgress, book.age, completeStage, createClient, effectiveModel, endProgress, questionImageFixTargetsForRun, language, onAction, refreshContent]);

  const closeImageFixReview = useCallback((): void => {
    setImageFixReview(null);
    setNotice('Proposed image corrections were discarded. Failed visual QA flags remain on the original images for later retry.');
  }, []);

  const applyImageFixReview = useCallback(async (): Promise<void> => {
    if (!imageFixReview) {
      return;
    }

    setIsBusy(true);
    setError('');
    setProgress(0);
    setProgressLabel('Applying image corrections');
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
        // Stage-based image QA does not create an Ability change-log entry.
        applied += 1;
        setProgress(applied);
      }));

      const hasChanges = imageFixReview.items.length > 0;

      if (hasChanges || !stageDone(imageFixReviewStage)) {
        await completeStage(imageFixReviewStage, hasChanges);
      }

      const fixed = imageFixReview.items.length;
      const failed = imageFixReview.unresolved.length;
      await onAbilityLogChange?.();

      setImageFixReview(null);
      setNotice(`${imageFixReviewStage === 'fixImages' ? 'Fix question images' : 'Fix answer images'} completed: ${fixed} approved image correction${fixed === 1 ? '' : 's'} applied; ${failed} visual${failed === 1 ? '' : 's'} still flagged for retry in Abilities. Processing can continue.`);
      refreshContent();
      onAction?.('preExercisesExercises');
    } catch (caught) {
      setImageFixReview(null);
      refreshContent();
      setError(caught instanceof Error ? caught.message : 'Unable to apply image QA changes.');
    } finally {
      setIsBusy(false);
    }
  }, [book.id, imageFixReview, imageFixReviewStage, onAbilityLogChange, onAction, refreshContent, completeStage, stageDone]);

  const openImageFix = useCallback((): void => {
    setFixOnlyFailedTikz(failedTikzTargets.some(({ field }) => field === 'p'));
    setAiAction('fixImages');
  }, [failedTikzTargets.length]);
  const openAnswerImages = useCallback((): void => {
    setGenerateOnlyMissingImages(missingAnswerImageGenerationTargets.length > 0 && missingAnswerImageGenerationTargets.length < answerImageGenerationTargets.length);
    setAiAction('answerImages');
  }, [answerImageGenerationTargets.length, missingAnswerImageGenerationTargets.length]);
  const retryMissingAnswerImages = useCallback((): void => {
    setGenerateOnlyMissingImages(true);
    setAiAction('answerImages');
  }, []);
  const openAnswerImageFix = useCallback((): void => {
    setFixOnlyFailedTikz(failedTikzTargets.some(({ field }) => field === 'i'));
    setAiAction('fixAnswerImages');
  }, [failedTikzTargets]);
  const confirm = useCallback((): void => {
    if (aiAction === 'skills') {
      generateSkills().catch(console.error);
    }

    if (aiAction === 'abilities') {
      generateAbilities().catch(console.error);
    }

    if (aiAction === 'fix') {
      fixAbilities().catch(console.error);
    }

    if (aiAction === 'images') {
      completeImagesStage().catch(console.error);
    }

    if (aiAction === 'answerImages') {
      completeAnswerImagesStage().catch(console.error);
    }

    if (aiAction === 'fixImages' || aiAction === 'fixAnswerImages') {
      fixImages(aiAction).catch(console.error);
    }
  }, [aiAction, completeAnswerImagesStage, completeImagesStage, fixAbilities, fixImages, generateAbilities, generateSkills]);

  useEffect((): void => {
    if (autoRunAll && aiAction && !isBusy) {
      confirm();
    }
  }, [aiAction, autoRunAll, confirm, isBusy]);

  useEffect((): void => {
    if (!autoRunAll || isBusy) {
      return;
    }

    if (fixReview) {
      void applyAbilityFixReview();
    } else if (imageFixReview) {
      void applyImageFixReview();
    }
  }, [applyAbilityFixReview, applyImageFixReview, autoRunAll, fixReview, imageFixReview, isBusy]);
  const closeConfirmation = useCallback((): void => {
    setAiAction(undefined);
    setGenerateOnlyMissingAbilities(false);
    setGenerateOnlyMissingImages(false);
    setFixOnlyFailedTikz(false);
  }, []);
  const skipStage = useCallback((): void => {
    const stage: BookProcessingStageKey | undefined = aiAction === 'fix' ? 'fixAbilities'
      : aiAction === 'abilities' || aiAction === 'images' || aiAction === 'fixImages' || aiAction === 'answerImages' || aiAction === 'fixAnswerImages' ? aiAction
        : undefined;

    if (!stage) return;
    void skipBookStage(book.id, stage).then((updated) => {
      onBookChange?.(updated);
      closeConfirmation();
      setError('');
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to skip this stage.'));
  }, [aiAction, book.id, closeConfirmation, onBookChange]);

  const pipelineActions = useMemo<PipelineAction[]>(() => [
    ...(pipelinePrefix ?? []).map((action) => action.key === 'concepts'
      ? { ...action, isResultComplete: chapterContent.length > 0 && chapterContent.every(({ concepts }) => concepts.length > 0) }
      : action),
    {
      key: 'abilities',
      label: 'Abilities',
      isDone: stageDone(ABILITIES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageReady('refineChapters') || !allConcepts.length,
      onClick: openAbilityGeneration
    },
    {
      key: 'fixAbilities',
      label: 'Fix abilities',
      isDone: stageDone(FIX_ABILITIES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageReady(ABILITIES_STAGE) || !hasAbilities,
      onClick: openAbilityFix
    },
    {
      key: 'images',
      label: 'Question Images',
      isDone: stageDone(IMAGES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageReady(FIX_ABILITIES_STAGE) || !hasAbilities,
      isResultComplete: missingImageGenerationTargets.length === 0,
      onClick: openImages,
      onRetryMissing: retryMissingImages
    },
    {
      key: 'fixImages',
      label: bookVisualQaStatus === 'failed' && failedTikzTargets.some(({ field }) => field === 'p') ? 'Fix question images (issues flagged)' : 'Fix question images',
      isDone: stageDone(FIX_IMAGES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageReady(IMAGES_STAGE) || !hasAbilities,
      onClick: openImageFix
    },
    {
      key: 'answerImages',
      label: 'Answer images',
      isDone: stageDone(ANSWER_IMAGES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageReady(FIX_IMAGES_STAGE) || !hasAbilities,
      isResultComplete: missingAnswerImageGenerationTargets.length === 0,
      onClick: openAnswerImages,
      onRetryMissing: retryMissingAnswerImages
    },
    {
      key: 'fixAnswerImages',
      label: failedTikzTargets.some(({ field }) => field === 'i') ? 'Fix answer images (issues flagged)' : 'Fix answer images',
      isDone: stageDone(FIX_ANSWER_IMAGES_STAGE),
      isDisabled: isBusy || !hasBookLanguage || !hasBookSubject || !stageReady(ANSWER_IMAGES_STAGE) || !hasAbilities,
      onClick: openAnswerImageFix
    },
    ...(pipelineSuffix ?? [])
  ], [chapterContent, conceptsMissingAbilities.length, failedTikzTargets, hasAbilities, hasBookLanguage, hasBookSubject, isBusy, missingAnswerImageGenerationTargets.length, missingImageGenerationTargets.length, openAbilityFix, openAbilityGeneration, openAnswerImageFix, openAnswerImages, openImageFix, openImages, pipelinePrefix, pipelineSuffix, retryMissingAnswerImages, retryMissingImages, stageDone, stageReady, bookVisualQaStatus]);
  // Stage navigation is not a success checkpoint. Keep the full pipeline
  // selectable even after a failure; each action still checks its prerequisites.
  const visiblePipelineActions = pipelineActions;
  const nextPendingAction = useCallback((): PipelineAction | undefined => nextUnresolvedStage(pipelineActions, book.bypassedStages)
    ?? pipelineActions[pipelineActions.length - 1], [book.bypassedStages, pipelineActions]);
  const [selectedPipelineKey, setSelectedPipelineKey] = useState('');
  const previousPipelineDoneRef = useRef<Map<string, boolean>>(new Map());
  const previousPipelineBypassRef = useRef<Set<string>>(new Set());
  const pipelineBookIdRef = useRef(book.id);

  // During Fast Forward the persisted run cursor, not the earliest failed
  // stage, owns the displayed selection. Manual navigation is unaffected.
  useEffect(() => {
    if (autoRunAll && processingRun?.mode === 'fastForward' && processingRun.currentStage && processingRun.currentStage !== selectedPipelineKey) {
      setSelectedPipelineKey(processingRun.currentStage);
    }
  }, [autoRunAll, processingRun?.currentStage, processingRun?.mode, selectedPipelineKey]);

  useEffect(() => {
    if (!visiblePipelineActions.length) {
      setSelectedPipelineKey('');
      previousPipelineDoneRef.current = new Map();
      previousPipelineBypassRef.current = new Set();
      return;
    }

    if (pipelineBookIdRef.current !== book.id) {
      pipelineBookIdRef.current = book.id;
      previousPipelineDoneRef.current = new Map(pipelineActions.map(({ isDone, key }) => [key, isDone] as const));
      previousPipelineBypassRef.current = new Set(book.bypassedStages ?? []);
      const next = nextPendingAction();

      setSelectedPipelineKey(next?.key ?? '');
      return;
    }

    const previousDone = previousPipelineDoneRef.current;
    const currentAction = visiblePipelineActions.find(({ key }) => key === selectedPipelineKey);
    const previousCurrentAction = pipelineActions.find(({ key }) => key === selectedPipelineKey);
    const justBypassed = !previousPipelineBypassRef.current.has(selectedPipelineKey) && (book.bypassedStages ?? []).includes(selectedPipelineKey);
    const justCompleted = previousCurrentAction
      && previousDone.get(previousCurrentAction.key) === false
      && previousCurrentAction.isDone;

    if (!currentAction) {
      setSelectedPipelineKey(nextPendingAction()?.key ?? '');
    } else if (justCompleted || (justBypassed && !autoRunAll)) {
      const next = nextUnresolvedStage(pipelineActions, book.bypassedStages, selectedPipelineKey);

      if (next) setSelectedPipelineKey(next.key);
    }

    previousPipelineDoneRef.current = new Map(pipelineActions.map(({ isDone, key }) => [key, isDone] as const));
    previousPipelineBypassRef.current = new Set(book.bypassedStages ?? []);
  }, [autoRunAll, book.bypassedStages, book.id, nextPendingAction, pipelineActions, selectedPipelineKey, visiblePipelineActions]);

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
      satisfiedStages: [...new Set([...(book.completedStages ?? []), ...(book.bypassedStages ?? [])])],
      successfulStages: book.completedStages ?? [],
      hasReview: Boolean(aiAction || fixReview || imageFixReview),
      error,
      onComplete: () => onAutoRunComplete?.(),
      onBookCheckpoint: (savedBook) => onBookChange(savedBook),
      onError: (message) => {
        setError(message);
        onAbortAutoRun?.();
      }
    });
  }, [aiAction, autoRunAll, book.id, error, externalAutoRunBusy, fixReview, imageFixReview, isBusy, isContentSnapshotCurrent, onAbortAutoRun, onAutoRunComplete, onBookChange, pipelineActions, processingRun]);

  const autoRunCompletedCount = autoRunStageKeys.reduce((count, key) => {
    if (processingRun?.completed.includes(key) || processingRun?.bypassedStages?.includes(key)) return count + 1;
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
    // On a successful handoff, retain the last real stage status in the parent
    // until the next stage reports work. Never show a fictional transition step.
  }, [autoRunAll, error, isBusy, onAutoRunProcessingChange, openRouterSpent, progress, progressLabel, progressTotal]);

  const runSelectedPipelineAction = useCallback((): void => {
    if (!selectedPipelineAction || selectedPipelineAction.isDisabled) {
      return;
    }

    selectedPipelineAction.onClick();
  }, [selectedPipelineAction]);

  const startAbilityReview = useCallback((): void => {
    try {
      sessionStorage.removeItem(reviewScopeSessionKey);
      sessionStorage.removeItem(scheduledReviewSessionKey);
      sessionStorage.setItem(activeReviewSessionKey, 'open');
    } catch {
      // Review mode still works when browser storage is restricted.
    }
    setReviewAbilityIds(undefined);
    setIsScheduledRereview(false);
    setIsReviewModeOpen(true);
  }, [activeReviewSessionKey, reviewScopeSessionKey, scheduledReviewSessionKey]);

  const closeAbilityReview = useCallback((): void => {
    try {
      sessionStorage.removeItem(activeReviewSessionKey);
      sessionStorage.removeItem(reviewScopeSessionKey);
      sessionStorage.removeItem(scheduledReviewSessionKey);
    } catch {
      // Closing Review mode must work even without session storage.
    }
    setReviewAbilityIds(undefined);
    setIsScheduledRereview(false);
    setIsReviewModeOpen(false);
    refreshContent();
  }, [activeReviewSessionKey, refreshContent, reviewScopeSessionKey, scheduledReviewSessionKey]);

  const handleReviewAbilityReplaced = useCallback((oldId: string, nextId: string): void => {
    // Rereview scopes contain stored Ability IDs, so replace the old ID in both
    // the live selection and the resumable session after a manual edit/delete.
    setReviewAbilityIds((previous) => {
      if (previous === undefined) return undefined;
      const next = previous.map((id) => id === oldId ? nextId : id);
      try {
        sessionStorage.setItem(reviewScopeSessionKey, JSON.stringify(next));
      } catch {
        // The in-memory review scope still works when storage is unavailable.
      }
      return next;
    });
  }, [reviewScopeSessionKey]);

  const markAbilityReviewed = useCallback(async (record: StoredAbility): Promise<void> => {
    // IndexedDB is the source of truth: only update the loaded snapshot after
    // the write succeeds. This is not a second review-status store.
    await setBookAbilityReviewed(book.id, record.id, true);
    setChapterContent((previous) => previous.map((chapter) => ({
      ...chapter,
      abilities: chapter.abilities.map((ability) => ability.id === record.id ? { ...ability, reviewed: true } : ability)
    })));
    // A failed secondary log refresh must not turn a successful DB commit into
    // an apparent failed review (and leave the user on an already-saved item).
    try {
      await onAbilityLogChange?.();
    } catch (error) {
      console.error('Unable to refresh the Ability change log after review:', error);
    }
  }, [book.id, onAbilityLogChange]);

  const openRereviewDialog = useCallback((): void => {
    setRereviewChapterIndexes(new Set(chapterIndex >= 0 && chapterIndex < chapterContent.length ? [chapterIndex] : []));
    setIsRereviewDialogOpen(true);
  }, [chapterContent.length, chapterIndex]);

  const toggleRereviewChapter = useCallback((index: number): void => {
    setRereviewChapterIndexes((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const rereviewSelectedChapters = useCallback(async (): Promise<void> => {
    if (!rereviewChapterIndexes.size || isResettingReview) return;
    setIsResettingReview(true);
    try {
      const ids = chapterContent.flatMap(({ abilities }, index) => rereviewChapterIndexes.has(index) ? abilities.map(({ id }) => id) : []);
      await resetBookAbilityReviews(book.id, ids);
      setIsRereviewDialogOpen(false);

      // Reflect the database reset immediately so the first selected Ability
      // appears in Review mode while the fresh chapter data is still loading.
      const resetIds = new Set(ids);
      setChapterContent((previous) => previous.map((chapter) => ({
        ...chapter,
        abilities: chapter.abilities.map((ability) => resetIds.has(ability.id) ? { ...ability, reviewed: false } : ability)
      })));
      try {
        sessionStorage.setItem(reviewScopeSessionKey, JSON.stringify(ids));
        sessionStorage.removeItem(scheduledReviewSessionKey);
        sessionStorage.setItem(activeReviewSessionKey, 'open');
      } catch {
        // Rereview still starts when browser storage is restricted.
      }
      setReviewAbilityIds(ids);
      setIsScheduledRereview(false);
      setIsReviewModeOpen(true);
      refreshContent();
      const count = rereviewChapterIndexes.size;
      setNotice(`Review status reset for ${count} selected chapter${count === 1 ? '' : 's'} (${ids.length} Abilities). Other chapters are unchanged.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to reset Ability review status.');
    } finally {
      setIsResettingReview(false);
    }
  }, [activeReviewSessionKey, book.id, chapterContent, isResettingReview, refreshContent, rereviewChapterIndexes, reviewScopeSessionKey, scheduledReviewSessionKey]);

  const rereviewScheduled = useCallback(async (): Promise<void> => {
    if (isResettingReview || isBusy || autoRunAll || externalAutoRunBusy || externalSplitQueueBusy) return;

    const { ids, missing } = queuedAbilityReviewSelection(queuedWorkItems, chapterContent);

    if (missing || !ids.length) {
      setQueueRemovalError(missing
        ? `${missing} scheduled Ability ${missing === 1 ? 'could not be found' : 'jobs could not be matched to Abilities'}. Remove or update those jobs before rereviewing.`
        : 'No scheduled Abilities are available to rereview.');
      return;
    }

    setQueueRemovalError('');
    setIsResettingReview(true);
    try {
      await resetBookAbilityReviews(book.id, ids);
      const resetIds = new Set(ids);

      // Show the reset status immediately, even before IndexedDB reload finishes.
      setChapterContent((previous) => previous.map((chapter) => ({
        ...chapter,
        abilities: chapter.abilities.map((ability) => resetIds.has(ability.id) ? { ...ability, reviewed: false } : ability)
      })));
      try {
        sessionStorage.setItem(reviewScopeSessionKey, JSON.stringify(ids));
        sessionStorage.setItem(scheduledReviewSessionKey, 'open');
        sessionStorage.setItem(activeReviewSessionKey, 'open');
      } catch {
        // The in-memory scoped review still works without session storage.
      }
      setReviewAbilityIds(ids);
      setIsScheduledRereview(true);
      onCloseSplitQueueConfirmation?.();
      setIsReviewModeOpen(true);
      refreshContent();
      setNotice(`${ids.length} scheduled ${ids.length === 1 ? 'Ability is' : 'Abilities are'} ready for rereview. Unscheduled Abilities are unchanged.`);
    } catch (caught) {
      setQueueRemovalError(caught instanceof Error ? caught.message : 'Unable to reset scheduled Ability review status.');
    } finally {
      setIsResettingReview(false);
    }
  }, [activeReviewSessionKey, autoRunAll, book.id, chapterContent, externalAutoRunBusy, externalSplitQueueBusy, isBusy, isResettingReview, onCloseSplitQueueConfirmation, queuedWorkItems, refreshContent, reviewScopeSessionKey, scheduledReviewSessionKey]);

  return <StyledSkills className={pipelineOnly ? 'pipelineOnly' : undefined}>
    {isReviewModeOpen && <AbilityReviewMode
      allowQueuedReview={isScheduledRereview}
      chapters={chapterContent}
      key={activeReviewSessionKey}
      isBusy={isBusy || externalSplitQueueBusy}
      isLoading={isReviewDataLoading}
      hasLoadError={isReviewDataLoadFailed}
      onCancelFix={onCancelFix}
      onClose={closeAbilityReview}
      onContentChange={refreshContent}
      onAbilityReplaced={handleReviewAbilityReplaced}
      onError={setError}
      onQueueFix={onQueueFix}
      onQueueSplit={onQueueSplit}
      onReviewed={markAbilityReviewed}
      queuedItems={isScheduledRereview ? queuedWorkItems : queuedFixItems}
      reviewAbilityIds={reviewAbilityIds}
    />}
    {isRereviewDialogOpen && <Modal header='Rereview Abilities' onClose={() => { if (!isResettingReview) setIsRereviewDialogOpen(false); }} size='small'>
      <Modal.Content>
        <RereviewChapterSelector>
          <p>Select the chapters whose Abilities should be marked as not reviewed. Chapters you do not select will remain unchanged.</p>
          <div className='rereviewSelectionToolbar'>
            <strong>{rereviewChapterIndexes.size} of {chapterContent.length} chapters selected</strong>
            <div>
              <Button icon='check' isDisabled={isResettingReview || rereviewChapterIndexes.size === chapterContent.length} label='Select all' onClick={() => setRereviewChapterIndexes(new Set(chapterContent.map((_, index) => index)))} />
              <Button icon='times' isDisabled={isResettingReview || rereviewChapterIndexes.size === 0} label='Clear selection' onClick={() => setRereviewChapterIndexes(new Set())} />
            </div>
          </div>
          <div aria-label='Chapters to rereview' className='rereviewChapterList' role='group'>
            {chapterContent.map(({ abilities, chapter }, index) => <label className='rereviewChapterOption' key={chapter.id ?? index}>
              <input checked={rereviewChapterIndexes.has(index)} disabled={isResettingReview} onChange={() => toggleRereviewChapter(index)} type='checkbox' />
              <span>{index + 1}. {chapter.title || 'Untitled chapter'}</span>
              <small>{abilities.length} {abilities.length === 1 ? 'Ability' : 'Abilities'}</small>
            </label>)}
          </div>
          <Button.Group>
            <Button icon='times' isDisabled={isResettingReview} label='Cancel' onClick={() => setIsRereviewDialogOpen(false)} />
            <Button icon='redo' isDisabled={isResettingReview || !rereviewChapterIndexes.size} label={isResettingReview ? 'Resetting…' : 'Rereview selected chapters'} onClick={() => { void rereviewSelectedChapters(); }} />
          </Button.Group>
        </RereviewChapterSelector>
      </Modal.Content>
    </Modal>}
    {editingChapter && <ChapterTitleEditor
      chapter={editingChapter}
      language={book.language}
      onClose={closeChapterEditor}
      onError={setError}
      onSaved={refresh}
                       />}
    {isSplitQueueConfirmationOpen && <StageRunPricePopup
      header={queuedWorkItems.length ? `Run ${queuedWorkItems.length} queued Ability ${queuedWorkItems.length === 1 ? 'job' : 'jobs'}?` : 'Scheduled Ability actions'}
      isRunDisabled={isQueueRunDisabled || isBusy || autoRunAll || externalAutoRunBusy || externalSplitQueueBusy || !splitQueueEstimate || typeof splitQueueEstimate === 'string' || queuedWorkItems.length === 0}
      onClose={() => { setQueueRemovalError(''); onCloseSplitQueueConfirmation?.(); }}
      onRun={() => { void runSplitQueue(); }}
    >
      {!!queuedWorkItems.length && <p>Queued jobs for different Concepts run in parallel. Fix Ability rewrites both exercises and regenerates/visually checks their question images before producing answer images from the checked questions. Detailed text edits can target specific fields. Failed jobs remain queued for retry.</p>}
      <QueuedAbilityWorkList
        chapterContent={chapterContent}
        isBusy={isBusy || autoRunAll || externalAutoRunBusy || externalSplitQueueBusy}
        isRereviewingScheduled={isResettingReview}
        onRereviewScheduled={() => { void rereviewScheduled(); }}
        items={queuedWorkItems}
        onRemove={onRemoveWorkQueueItem ? (itemId) => {
          setQueueRemovalError('');
          void onRemoveWorkQueueItem(itemId).catch((error: unknown) => setQueueRemovalError(error instanceof Error ? error.message : String(error)));
        } : undefined}
        removingItemId={removingWorkQueueItemId}
      />
      {queueRemovalError && <p role='alert'>{queueRemovalError}</p>}
      {!!queuedWorkItems.length && <>
        <AiPriceEstimate estimate={splitQueueEstimate} />
        <p><small>{queuedSplitIds.length
          ? 'Split estimate assumes two children with question and answer figures per child. '
          : 'A full Fix Ability plans 1 Ability rewrite, 2 question images, 2 question-image reviews, 2 answer images based on the reviewed questions, and 2 answer-image reviews. '}
        Actual cost may be higher when AI validation or image QA requires repairs and retries.</small></p>
        <OpenRouterModelSelector
          className='modelSelect'
          isDisabled={isBusy}
          onChange={setSelectedModel}
          value={selectedModel}
        />
      </>}
    </StageRunPricePopup>}
    <SkillsReviewModals
      applyAbilityFixReview={applyAbilityFixReview}
      applyImageFixReview={applyImageFixReview}
      autoRunAll={autoRunAll}
      closeFixReview={closeFixReview}
      closeImageFixReview={closeImageFixReview}
      fixReview={fixReview}
      imageFixReview={imageFixReview}
      imageFixReviewStage={imageFixReviewStage}
      isBusy={isBusy}
    />
    <SkillsControls
      bookId={book.id}
      abilitiesMissingImagesCount={aiAction === 'answerImages' ? new Set(missingAnswerImageGenerationTargets.map(({ record }) => record.id)).size : abilitiesMissingImages.size}
      failedTikzCount={aiAction === 'fixAnswerImages' ? failedAnswerTikzAbilityCount : failedTikzAbilityCount}
      fixOnlyFailedTikz={fixOnlyFailedTikz}
      abortProcessing={abortProcessing}
      aiAction={aiAction}
      autoRunAll={autoRunAll}
      autoRunCompletedCount={autoRunCompletedCount}
      autoRunStageCount={autoRunStageKeys.length}
      closeConfirmation={closeConfirmation}
      confirm={confirm}
      skipStage={skipStage}
      error={error}
      estimate={estimate}
      conceptsMissingAbilitiesCount={conceptsMissingAbilities.length}
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
      selectedPipelineAction={externalSplitQueueBusy ? undefined : selectedPipelineAction}
      selectedPipelineKey={selectedPipelineKey}
      setGenerateOnlyMissingAbilities={setGenerateOnlyMissingAbilities}
      setGenerateOnlyMissingImages={setGenerateOnlyMissingImages}
      setFixOnlyFailedTikz={setFixOnlyFailedTikz}
      setSelectedModel={setSelectedModel}
      setSelectedPipelineKey={setSelectedPipelineKey}
      showPipeline={showPipeline}
      visiblePipelineActions={visiblePipelineActions}
      bypassedStageKeys={book.bypassedStages ?? []}
      failedStageKeys={Object.keys(processingRun?.failedStages ?? {})}
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
      deleteConceptAndAbilities={deleteConceptAndAbilities}
      splitSingleAbility={(record) => onQueueSplit?.(record)}
      scheduleAbilityFix={onQueueFix}
      queuedFixItems={queuedFixItems}
      onCancelFix={onCancelFix}
      onStartReview={startAbilityReview}
      onRereview={openRereviewDialog}
      splitQueueConceptIds={queuedSplitIds}
      isBusy={isBusy || externalSplitQueueBusy}
      focusConceptAbility={focusConceptAbility}
      failedVisualCountsByChapter={failedVisualCountsByChapter}
      missingAbilityCountsByChapter={missingAbilityCountsByChapter}
      onError={setError}
      openChapterEditor={openChapterEditor}
      pipelineOnly={pipelineOnly}
      refresh={refresh}
      refreshContent={refreshContent}
      tikzIssuesByImageId={tikzIssuesByImageId}
      view={view}
    />
  </StyledSkills>;
}

export default React.memo(Skills);
