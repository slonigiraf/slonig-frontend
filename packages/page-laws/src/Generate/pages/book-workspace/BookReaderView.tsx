// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookChapter, BookConcept, Exercise } from '@slonigiraf/db';
import { isBookProcessingStageComplete } from '@slonigiraf/db';
import { Confirmation, SpanWithTags, SelectableList } from '@slonigiraf/slonig-components';
import MathpixLoader from 'mathpix-markdown-it/lib/components/mathpix-loader/index.js';
import MathpixMarkdown from 'mathpix-markdown-it/lib/components/mathpix-markdown/index.js';
import React from 'react';
import { Button, Dropdown, Input, Modal } from '@polkadot/react-components';
import { bookAgeLabel, MAX_BOOK_LEARNER_AGE, MIN_BOOK_LEARNER_AGE, normalizeBookAge } from '../../book/domain/metadata/bookAge.js';
import { BOOK_LANGUAGE_OPTIONS, bookLanguageLabel, normalizeLanguageCode } from '../../book/domain/metadata/bookLanguage.js';
import { BOOK_SUBJECT_OPTIONS, automaticBookSubjectForLanguage, bookSubjectLabel, normalizeBookSubject } from '../../book/domain/metadata/bookSubject.js';
import OpenRouterModelSelector from '../../../openrouter/components/ModelSelector.js';
import { fixConceptsChapterKey } from '../../book/infrastructure/storage/fixConceptsProgress.js';
import { formatOpenRouterSpend } from '../../../openrouter/cost.js';
import { pageChapterEvidence } from '../../book/domain/chapters/chapterSegmentation.js';
import { missingGeneratedExerciseConceptIndexes } from '../../book/domain/exercises/exercises.js';
import { hasChapterStandards, STANDARD_FRAMEWORKS, standardsChapterKey } from '../../book/domain/standards/standards.js';
import Skills, { SkillsCourse } from '../../features/skills/index.js';
import { AiPriceEstimate } from '../../shared/ui/PriceEstimate.js';
import ProcessingPopup from '../../shared/ui/ProcessingPopup.js';
import StageRunPricePopup from '../../shared/ui/StageRunPricePopup.js';

import { StyledReader } from './BookReader.styles.js';
import { ChapterTitleEditor, ConceptForm, ConceptItem, EditableExerciseItem, FixConceptsReviewContent } from './components/index.js';
import { conceptDisplayPage, conceptReferenceKey, exerciseChapterNavigationKey } from '../../book/application/workspace/bookReaderWorkspace.js';
import type { FixConceptsReviewChapter } from './BookReaderTypes.js';
import type { ConceptEmbeddingHeatmapEntry, ReaderPane } from '../../shared/types/bookWorkspace.js';
import type { BookReaderController } from './BookReaderController.js';

interface Props { controller: BookReaderController; }

export function BookReaderView ({ controller }: Props): React.ReactElement {
  const {
    abortProcessing,
    activePane,
    addConcept,
    ageDetectionEstimate,
    ageInput,
    applyDeduplicateConceptsReview,
    applyFixConceptsReview,
    assignCurrentPageToChapter,
    assignStandards,
    autoRunAll,
    autoRunProgress,
    autoRunStartKey,
    autoRunSkipRefineChapters,
    beginConceptPointerDrag,
    book,
    cancelConceptPointerDrag,
    canvasRef,
    changeConceptChapter,
    changeExerciseChapter,
    changeStandardsChapter,
    chapterGenerationEstimate,
    chapterIdentificationLabel,
    chapterTitleDraft,
    chapters,
    closeAgeDetectionConfirmation,
    closeChapterEditor,
    closeConceptInsertion,
    closeLanguageDetectionConfirmation,
    closeMathpixKeyPrompt,
    closePageGenerationConfirmation,
    closeSubjectDetectionConfirmation,
    conceptChapterIndex,
    conceptChapters,
    conceptCountsByChapter,
    conceptInsertionOptions,
    concepts,
    conceptsOutputRef,
    confirmAgeDetection,
    confirmLanguageDetection,
    confirmPageGeneration,
    confirmSubjectDetection,
    currentBookPage,
    currentChapter,
    currentConceptChapter,
    currentExerciseChapter,
    currentStandardsChapter,
    currentStandardsChapterKey,
    deduplicateConceptsReview,
    deleteConcept,
    deleteSelectedChapters,
    discardDeduplicateConceptsReview,
    discardFixConceptsReview,
    editingChapter,
    embeddingHeatmapDistances,
    embeddingHeatmapEntries,
    embeddingHeatmapMode,
    embeddingMissingCount,
    endConceptPointerDrag,
    entityCounts,
    error,
    exerciseChapterConcepts,
    exerciseChapterExercises,
    exerciseChapterIndex,
    exerciseChapterMissingCounts,
    exerciseChapters,
    exerciseConceptsOutputRef,
    fixConceptWithAi,
    fixConceptsChapterStatuses,
    fixConceptsReview,
    fixConceptsReviewChapterIndex,
    fixConceptsTargetChapterCount,
    fixExerciseWithAi,
    fixedConceptsChapterCount,
    generatedConceptsChapterCount,
    goToPage,
    hasReaderProcessing,
    hasRecognitionBeenAttempted,
    identifiedChapterPageCount,
    isAddingConcept,
    isAgeDetectionConfirmationOpen,
    isApplyingDeduplicateConceptsReview,
    isApplyingFixConceptsReview,
    isAssigningStandards,
    isCurrentPageUnrecognized,
    isDeduplicatingConcepts,
    isDeleteChaptersConfirmationOpen,
    isDeletingChapters,
    isDetectingBookAge,
    isDetectingBookLanguage,
    isDetectingBookSubject,
    isEmbeddingHeatmapLoading,
    isExerciseChapterLoading,
    isFixingConcepts,
    isGeneratingAllConcepts,
    isGeneratingChapterConcepts,
    isIdentifyingChapters,
    isLanguageDetectionConfirmationOpen,
    isMathpixKeyPromptOpen,
    isMaximized,
    isMmdConversionComplete,
    isPageGenerationConfirmationOpen,
    isPriceDisabled,
    isRecognizingAll,
    isRefiningChapters,
    isReorderingConcepts,
    isSavingNewConcept,
    isSortingConcepts,
    isSubjectDetectionConfirmationOpen,
    languageDetectionEstimate,
    mathpixApiKey,
    mergeCurrentChapterWithPrevious,
    moveConceptPointerDrag,
    newChapterTitle,
    newConceptAfterIndex,
    newConceptDescription,
    newConceptPage,
    newConceptTitle,
    onAbortFastForward,
    onAutoRunComplete,
    onBookChange,
    onFastForward,
    onPrice,
    onSkillsContentChange,
    onSkillsEntityCountsChange,
    openChapterEditor,
    openConceptInsertion,
    openRouterSpent,
    pageAreaRef,
    pageInput,
    pageNumber,
    pages,
    processingPage,
    processingPopupStatus,
    processingToolbar,
    processingToolbarAfterFixImages,
    recognitionTarget,
    recognizedPageCount,
    refinedChaptersChapterCount,
    refreshAfterChapterRename,
    removeFixConceptsReviewConcept,
    renderedPageHeight,
    rerecognizePage,
    revealPane,
    revealedPanes,
    saveConcept,
    saveCurrentChapterTitle,
    saveExercise,
    saveManualBookAge,
    saveManualBookLanguage,
    saveManualBookSubject,
    selectedAgeModel,
    selectedChapterIds,
    selectedLanguageModel,
    selectedModel,
    selectedPipelineKey,
    selectedSubjectModel,
    setActivePane,
    setAgeInput,
    setAutoRunProcessing,
    setAutoRunProgress,
    setChapterTitleDraft,
    setEmbeddingHeatmapMode,
    setError,
    setFixConceptsReviewChapterIndex,
    setIsDeleteChaptersConfirmationOpen,
    setIsMaximized,
    setMathpixApiKey,
    setNewChapterTitle,
    setNewConceptAfterIndex,
    setNewConceptDescription,
    setNewConceptPage,
    setNewConceptTitle,
    setPageInput,
    setSelectedAgeModel,
    setSelectedLanguageModel,
    setSelectedModel,
    setSelectedPipelineKey,
    setSelectedSubjectModel,
    showUnrecognizedPages,
    skillsRefreshToken,
    sortedConceptsChapterCount,
    standardDescriptions,
    standardsAssignedChapterCount,
    standardsTargetChapterCount,
    standardsByChapter,
    standardsChapterIndex,
    standardsChapterOutputRef,
    startChapterHere,
    subjectDetectionEstimate,
    submitMathpixApiKey,
    submitPageInput,
    t,
    toggleChapterSelection,
    toggleDeduplicateConceptDeletion,
    toggleFixConceptsReviewRemoval,
    totalPages,
    unrecognizedPageNumbers,
  } = controller;

  const recognizedTextPane = (): React.ReactNode => (
    <div className='tabPanel'>
      <div className='detailsHeader'>
        <span>{isRecognizingAll
          ? `Recognizing all pages… ${recognizedPageCount}/${totalPages}`
          : processingPage === pageNumber
            ? 'Recognizing page…'
            : 'Recognized text'}</span>
      </div>
      {pages.get(pageNumber)?.pageMMD !== undefined
        ? <div className='recognizedOutput'>
          {pages.get(pageNumber)?.pageMMD?.trim()
            ? <MathpixLoader>
              <MathpixMarkdown text={pages.get(pageNumber)?.pageMMD ?? ''} />
            </MathpixLoader>
            : <p className='emptyOutput'>No recognizable text was found on this page.</p>}
        </div>
        : <>
          <p className='emptyOutput'>This page has not been recognized yet.</p>
          {activePane === 'text' && hasRecognitionBeenAttempted && isCurrentPageUnrecognized && <div className='rerecognizePage'>
            <Button
              icon='rotate-left'
              isDisabled={processingPage !== undefined || isRecognizingAll || isGeneratingAllConcepts || isIdentifyingChapters}
              label={processingPage === pageNumber ? 'Recognizing…' : 'Rerecognize'}
              onClick={rerecognizePage}
            />
          </div>}
        </>}
    </div>
  );

  const languagePane = (): React.ReactNode => {
    const selectedLanguage = normalizeLanguageCode(book.language);

    return <div className='tabPanel languagePanel'>
      <div className='detailsHeader'>
        <span>{isDetectingBookLanguage ? 'Detecting book language…' : `Book language: ${bookLanguageLabel(book.language)}`}</span>
      </div>
      <div className='languageActions'>
        <div
          aria-label='Choose book language'
          className='languageButtonGrid'
          role='group'
        >
          {BOOK_LANGUAGE_OPTIONS.map(({ text, value }) => <button
            aria-pressed={selectedLanguage === value}
            className={selectedLanguage === value ? 'selected' : ''}
            disabled={!isMmdConversionComplete || isDetectingBookLanguage}
            key={value}
            onClick={() => saveManualBookLanguage(value).catch(console.error)}
            type='button'
          >{text}</button>)}
        </div>
      </div>
    </div>;
  };

  const subjectPane = (): React.ReactNode => {
    const selectedSubject = normalizeBookSubject(book.subject);

    return <div className='tabPanel languagePanel'>
      <div className='detailsHeader'>
        <span>{isDetectingBookSubject ? 'Detecting book subject…' : `Book subject: ${bookSubjectLabel(book.subject)}`}</span>
      </div>
      <div className='languageActions'>
        <div
          aria-label='Choose book subject'
          className='languageButtonGrid'
          role='group'
        >
          {BOOK_SUBJECT_OPTIONS.map(({ text, value }) => <button
            aria-pressed={selectedSubject === value}
            className={selectedSubject === value ? 'selected' : ''}
            disabled={!book.language || !isMmdConversionComplete || isDetectingBookSubject}
            key={value}
            onClick={() => saveManualBookSubject(value).catch(console.error)}
            type='button'
          >{text}</button>)}
        </div>
      </div>
    </div>;
  };

  const agePane = (): React.ReactNode => {
    const manualAge = normalizeBookAge(ageInput);

    return <div className='tabPanel languagePanel'>
      <div className='detailsHeader'>
        <span>{isDetectingBookAge ? 'Detecting learner age…' : `Learner age: ${bookAgeLabel(book.age)}`}</span>
      </div>
      <div className='languageActions'>
        <div className='ageManualEditor'>
          <label>
            <span>Age in years</span>
            <input
              aria-label='Learner age in years'
              disabled={isDetectingBookAge}
              max={MAX_BOOK_LEARNER_AGE}
              min={MIN_BOOK_LEARNER_AGE}
              onChange={({ target }) => setAgeInput(target.value)}
              onKeyDown={({ key }) => key === 'Enter' && saveManualBookAge().catch(console.error)}
              step={1}
              type='number'
              value={ageInput}
            />
          </label>
          <Button
            icon='save'
            isDisabled={isDetectingBookAge || manualAge === undefined}
            label='Save age'
            onClick={() => saveManualBookAge().catch(console.error)}
          />
        </div>
      </div>
    </div>;
  };

  const chaptersPane = (): React.ReactNode => {
    const evidence = currentBookPage ? pageChapterEvidence(currentBookPage) : undefined;
    const currentChapterPages = currentChapter?.id === undefined
      ? []
      : Array.from(pages.values()).filter(({ chapterId }) => chapterId === currentChapter.id).sort((a, b) => a.pageNumber - b.pageNumber);
    const isChapterStart = currentChapterPages[0]?.pageNumber === pageNumber;

    return <div className='tabPanel chaptersPanel'>
      <div className='detailsHeader'>
        <span>{isIdentifyingChapters ? `${chapterIdentificationLabel}… ${identifiedChapterPageCount}/${totalPages}` : 'Chapter assignment'}</span>
      </div>
      <div className='chapterEditor'>
        <h3>{currentChapter?.title || 'Unassigned page'}</h3>
        <p>Page {pageNumber} of {totalPages}. Automatic detection uses Mathpix title/section-header evidence plus a book-level AI reconciliation pass.</p>
        <label>Assign this page
          <select
            disabled={!chapters.length || isIdentifyingChapters}
            onChange={({ target }) => assignCurrentPageToChapter(Number(target.value)).catch(console.error)}
            value={currentChapter?.id ?? ''}
          >
            <option disabled value=''>Choose chapter</option>
            {chapters.flatMap((chapter) => chapter.id === undefined ? [] : [<option key={chapter.id} value={chapter.id}>{chapter.title}</option>])}
          </select>
        </label>
        <div className='chapterEditRow'>
          <Input
            isFull
            label='Chapter title'
            onChange={setChapterTitleDraft}
            onEnter={() => saveCurrentChapterTitle().catch(console.error)}
            value={chapterTitleDraft}
          />
          <Button
            icon='save'
            isDisabled={currentChapter?.id === undefined || !chapterTitleDraft.trim() || isIdentifyingChapters}
            label='Rename'
            onClick={() => saveCurrentChapterTitle().catch(console.error)}
          />
        </div>
        <div className='chapterEditRow'>
          <Input
            isFull
            label='New chapter starting on this page'
            onChange={setNewChapterTitle}
            onEnter={() => startChapterHere().catch(console.error)}
            placeholder='Chapter title'
            value={newChapterTitle}
          />
          <Button
            icon='plus'
            isDisabled={!newChapterTitle.trim() || isIdentifyingChapters}
            label='Start here'
            onClick={() => startChapterHere().catch(console.error)}
          />
        </div>
        <Button
          icon='link'
          isDisabled={!isChapterStart || chapters.findIndex(({ id }) => id === currentChapter?.id) <= 0 || isIdentifyingChapters}
          label='Merge with previous chapter'
          onClick={() => mergeCurrentChapterWithPrevious().catch(console.error)}
        />
        <section className='headingEvidence'>
          <h4>Mathpix heading evidence</h4>
          {evidence?.headings.length
            ? <ul>{evidence.headings.map(({ confidence, source, text, type }, index) => <li key={`${source}:${type}:${index}`}><strong>{type}</strong> ({source}{confidence === undefined ? '' : `, ${(confidence * 100).toFixed(0)}%`}): {text}</li>)}</ul>
            : <p className='emptyOutput'>No title or section header was detected on this page.</p>}
        </section>
        <section className='chapterList'>
          <div className='chapterListHeader'>
            <h4>Book chapters</h4>
            <Button
              icon='trash-can'
              isDisabled={!selectedChapterIds.size || isDeletingChapters || isIdentifyingChapters}
              label={isDeletingChapters ? 'Deleting…' : `Delete selected${selectedChapterIds.size ? ` (${selectedChapterIds.size})` : ''}`}
              onClick={() => setIsDeleteChaptersConfirmationOpen(true)}
            />
          </div>
          <p className='chapterListHint'>Deleting a chapter excludes its pages from Concepts and later analysis. The recognized page text stays in the book.</p>
          <div className='chapterRows'>
            <SelectableList<BookChapter>
              items={chapters}
              allSelected={false}
              renderItem={(chapter, _isSelected, isSelectionAllowed) => {
                const chapterPages = chapter.id === undefined ? [] : Array.from(pages.values()).filter(({ chapterId }) => chapterId === chapter.id).map(({ pageNumber }) => pageNumber).sort((a, b) => a - b);
                const first = chapterPages[0];
                const last = chapterPages[chapterPages.length - 1];
                const chapterNumber = chapters.indexOf(chapter) + (chapters[0]?.title.trim().toLocaleLowerCase().replace(/[\s-]+/g, '') === 'frontmatter' ? 0 : 1);
                const isSelected = chapter.id !== undefined && selectedChapterIds.has(chapter.id);

                return <div className='chapterListRow' key={chapter.id ?? chapter.title}>
                  {chapter.id !== undefined && <Button
                    className='inList'
                    icon={isSelected ? 'check' : 'square'}
                    isDisabled={!isSelectionAllowed}
                    onClick={() => toggleChapterSelection(chapter.id!)}
                  />}
                  <span className='chapterNumber'>{chapterNumber}.</span>
                  <span><button className='chapterLink' onClick={() => first && goToPage(first)} type='button'>{chapter.title}</button>{first ? ` — pages ${first}${last !== first ? `–${last}` : ''}` : ''}{chapter.source === 'manual' ? ' · manual' : chapter.confidence === undefined ? '' : ` · ${(chapter.confidence * 100).toFixed(0)}%`}</span>
                </div>;
              }}
              onSelectionChange={() => {}}
              isSelectionAllowed={!isDeletingChapters && !isIdentifyingChapters}
              keyExtractor={(chapter) => String(chapter.id ?? chapter.title)}
              key={chapters.map(({ id, title }) => String(id ?? title)).join(':')}
            />
          </div>
          {isDeleteChaptersConfirmationOpen && <Confirmation
            onClose={() => !isDeletingChapters && setIsDeleteChaptersConfirmationOpen(false)}
            onConfirm={() => {
              setIsDeleteChaptersConfirmationOpen(false);
              deleteSelectedChapters().catch(console.error);
            }}
            question={`Delete ${selectedChapterIds.size} selected chapter${selectedChapterIds.size === 1 ? '' : 's'}?`}
          />}
        </section>
      </div>
    </div>;
  };

  const conceptsStatus = isGeneratingAllConcepts
    ? `Generating concepts by chapter… ${generatedConceptsChapterCount}/${conceptChapters.length}`
    : isFixingConcepts
      ? `Fixing concepts… ${fixedConceptsChapterCount}/${fixConceptsTargetChapterCount || conceptChapters.length} chapter checks`
      : isDeduplicatingConcepts
        ? 'Deduplicating concepts across chapters…'
      : isSortingConcepts
        ? `Sorting concepts by ZPD… ${sortedConceptsChapterCount}/${conceptChapters.length}`
      : isRefiningChapters
        ? `Refining chapters by theme… ${refinedChaptersChapterCount}/${conceptChapters.length}`
      : isGeneratingChapterConcepts
        ? 'Extracting and saving concepts for this chapter…'
        : 'Concepts';
  const exerciseItem = (exercise: Exercise): React.ReactNode => <EditableExerciseItem
    exercise={exercise}
    key={exercise.id}
    onError={setError}
    onFix={fixExerciseWithAi}
    onSave={saveExercise}
  />;
  const focusExerciseConcept = (conceptIndex: number): void => {
    const conceptSection = exerciseConceptsOutputRef.current?.querySelector<HTMLElement>(`[data-concept-rank="${conceptIndex + 1}"]`);

    if (!conceptSection) {
      return;
    }

    conceptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    conceptSection.focus({ preventScroll: true });
  };
  const conceptsPane = (): React.ReactNode => {
    return <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'>
        <span>{conceptsStatus}</span>
        <Button
          icon='plus'
          isDisabled={!currentConceptChapter || isAddingConcept || isReorderingConcepts || isSavingNewConcept}
          label='Add concept'
          onClick={openConceptInsertion}
        />
      </div>
      {isAddingConcept && currentConceptChapter && <Modal
        header='Add concept'
        onClose={closeConceptInsertion}
        size='small'
      >
        <Modal.Content>
          <ConceptForm>
            <Input
              autoFocus
              isDisabled={isSavingNewConcept}
              isFull
              label='Concept title'
              onChange={setNewConceptTitle}
              onEnter={() => { void addConcept().catch(console.error); }}
              value={newConceptTitle}
            />
            <label>
              <span>Description</span>
              <textarea
                disabled={isSavingNewConcept}
                onChange={({ target }) => setNewConceptDescription(target.value)}
                rows={5}
                value={newConceptDescription}
              />
            </label>
            <Dropdown
              isDisabled={isSavingNewConcept}
              isFull
              label='Page (optional)'
              onChange={setNewConceptPage}
              options={[
                { text: 'No page', value: '' },
                ...currentConceptChapter.pageNumbers.map((chapterPageNumber) => ({ text: String(chapterPageNumber), value: String(chapterPageNumber) }))
              ]}
              value={newConceptPage}
            />
            <Dropdown
              isDisabled={isSavingNewConcept}
              isFull
              label='Insert after concept'
              onChange={setNewConceptAfterIndex}
              options={conceptInsertionOptions}
              value={newConceptAfterIndex}
            />
            <Button.Group>
              <Button
                icon='times'
                isDisabled={isSavingNewConcept}
                label='Cancel'
                onClick={closeConceptInsertion}
              />
              <Button
                icon='save'
                isDisabled={isSavingNewConcept || !newConceptTitle.trim()}
                label={isSavingNewConcept ? 'Adding…' : 'Add'}
                onClick={() => addConcept().catch(console.error)}
              />
            </Button.Group>
          </ConceptForm>
        </Modal.Content>
      </Modal>}
      {!currentConceptChapter && <p className='recognitionHint'>Identify or assign this page to a chapter before generating concepts.</p>}
      <div
        className='conceptsOutput'
        ref={conceptsOutputRef}
      >
        <section className='conceptExerciseGroup'>
          {concepts.length
            ? <ul className='conceptList'>{concepts.map((concept, index) => {
              const displayPage = conceptDisplayPage(concept);

              return <ConceptItem
                chapterIndex={conceptChapterIndex}
                chapters={conceptChapters}
                concept={concept}
                conceptNumber={index + 1}
                firstPage={displayPage}
                key={concept.id ?? conceptReferenceKey(concept)}
                onDelete={deleteConcept}
                onFix={fixConceptWithAi}
                onReorderPointerCancel={cancelConceptPointerDrag}
                onReorderPointerDown={(event) => beginConceptPointerDrag(index, event)}
                onReorderPointerMove={moveConceptPointerDrag}
                onReorderPointerUp={endConceptPointerDrag}
                onGoToPage={goToPage}
                onSave={saveConcept}
              />;
            })}</ul>
            : <p className='emptyOutput'>No concepts in this chapter.</p>}
        </section>
      </div>
    </div>;
  };

  const standardsPane = (): React.ReactNode => {
    const missingStandardsCount = conceptChapters.filter(({ chapterId, title, pageNumbers }) =>
      !hasChapterStandards(standardsByChapter[standardsChapterKey(chapterId, title, pageNumbers)])).length;
    const assignment = currentStandardsChapterKey === undefined ? undefined : standardsByChapter[currentStandardsChapterKey];
    const applicableFrameworks = STANDARD_FRAMEWORKS.map((framework) => ({
      ...framework,
      standards: assignment?.standards.filter(({ framework: standardFramework }) => standardFramework === framework.key) ?? []
    })).filter(({ standards }) => standards.length);

    return <div className='tabPanel standardsPanel'>
      <div className='detailsHeader'>
        <span>{isAssigningStandards
          ? `Identifying standards… ${standardsAssignedChapterCount}/${standardsTargetChapterCount || conceptChapters.length}`
          : `${conceptChapters.length - missingStandardsCount} of ${conceptChapters.length} chapters have standards${missingStandardsCount ? ` · ${missingStandardsCount} missing` : ''}`}</span>
        <Button
          isDisabled={isAssigningStandards || !missingStandardsCount}
          label={`Identify missing standards (${missingStandardsCount})`}
          onClick={() => { void assignStandards(false).catch((error: unknown) => setError(error instanceof Error ? error.message : 'Unable to identify missing standards.')); }}
        />
      </div>
      <div
        className='conceptsOutput standardsOutput'
        ref={standardsChapterOutputRef}
        tabIndex={-1}
      >
        <h3>{currentStandardsChapter?.title || 'Chapter not identified'}</h3>
        {!currentStandardsChapter
          ? <p className='emptyOutput'>No processed chapters are available.</p>
          : isAssigningStandards && !assignment
            ? <p className='emptyOutput'>Standards for this chapter are being matched against the chapter concepts.</p>
            : !assignment
              ? <p className='emptyOutput'>Standards have not been identified for this chapter yet.</p>
              : applicableFrameworks.length
                ? applicableFrameworks.map(({ key, label, standards }) => <section
                  className='standardsFramework'
                  key={key}
                >
                  <h4>{label}</h4>
                  <ul>{standards.map(({ code, distance, framework }) => {
                    const description = standardDescriptions.get(`${framework}:${code}`);

                    return <li key={code}>
                      <div className='standardHeading'>
                        <code>{code}</code>
                        {distance !== undefined && Number.isFinite(distance) && <span
                          className='standardDistance'
                          title='Cosine distance to the nearest concept embedding in this chapter. Lower is closer.'
                        >{distance.toFixed(4)}</span>}
                      </div>
                      {description && <p>{description}</p>}
                    </li>;
                  })}</ul>
                </section>)
                : <p className='emptyOutput'>No standards were matched for this chapter. You can retry missing standards identification.</p>}
      </div>
      {isAssigningStandards && <small className='standardsSpend'>OpenRouter spend: {formatOpenRouterSpend(openRouterSpent)}</small>}
    </div>;
  };

  const conceptHeatmap = (entries: ConceptEmbeddingHeatmapEntry[], distances: Array<Array<number | undefined>>): React.ReactNode => {
    if (!entries.length) {
      return <p className='emptyOutput'>No cached concept embeddings are available for this view. Run Embedings again to create or refresh them.</p>;
    }

    return <div className='embeddingHeatmapScroller'>
      <table className='embeddingHeatmap'>
        <thead>
          <tr>
            <th className='embeddingHeatmapCorner'>Concept</th>
            {entries.map(({ concept }, index) => <th
              key={concept.id ?? conceptReferenceKey(concept)}
              title={concept.title}
            >{index + 1}</th>)}
          </tr>
        </thead>
        <tbody>{entries.map((row, rowIndex) => <tr key={row.concept.id ?? conceptReferenceKey(row.concept)}>
          <th title={`${rowIndex + 1}. ${row.concept.title}`}><span>{rowIndex + 1}.</span> {row.concept.title}</th>
          {entries.map((column, columnIndex) => {
            const distance = distances[rowIndex]?.[columnIndex];
            const intensity = distance === undefined ? 0 : Math.max(0, 1 - Math.min(1, distance));
            const backgroundAlpha = 0.08 + intensity * 0.7;

            return <td
              key={column.concept.id ?? columnIndex}
              style={{
                backgroundColor: `rgba(47, 111, 235, ${backgroundAlpha.toFixed(3)})`,
                color: intensity > 0.58 ? '#fff' : 'var(--color-text)'
              }}
              title={distance === undefined
                ? `${row.concept.title} ↔ ${column.concept.title}: unavailable`
                : `${row.concept.title} ↔ ${column.concept.title}: cosine distance ${distance.toFixed(4)}`}
            >{distance === undefined ? '—' : distance.toFixed(2)}</td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>;
  };

  const embeddingsPane = (): React.ReactNode => {
    const entries = embeddingHeatmapEntries;
    const title = embeddingHeatmapMode === 'chapter'
      ? (currentStandardsChapter?.title || 'Chapter not identified')
      : book.name;

    return <div className='tabPanel embeddingsPanel'>
      <div className='detailsHeader'>
        <span>Concept embedding heatmap</span>
        <div
          aria-label='Embedding heatmap scope'
          className='embeddingScopeTabs'
          role='group'
        >
          <button
            aria-pressed={embeddingHeatmapMode === 'chapter'}
            className={embeddingHeatmapMode === 'chapter' ? 'active' : ''}
            onClick={() => setEmbeddingHeatmapMode('chapter')}
            type='button'
          >Chapter</button>
          <button
            aria-pressed={embeddingHeatmapMode === 'book'}
            className={embeddingHeatmapMode === 'book' ? 'active' : ''}
            onClick={() => setEmbeddingHeatmapMode('book')}
            type='button'
          >Whole book</button>
        </div>
      </div>
      <div
        className='embeddingHeatmapIntro'
        ref={standardsChapterOutputRef}
        tabIndex={-1}
      >
        <strong>{title}</strong>
        <span>Cosine distance between concept embeddings. Lower values are closer; 0 means identical direction.</span>
        {embeddingMissingCount > 0 && <span className='embeddingCacheWarning'>{embeddingMissingCount} concept embedding{embeddingMissingCount === 1 ? '' : 's'} missing or stale. Run Standards again to refresh the cache.</span>}
      </div>
      {isEmbeddingHeatmapLoading
        ? <p className='emptyOutput'>Loading cached concept embeddings…</p>
        : conceptHeatmap(entries, embeddingHeatmapDistances)}
    </div>;
  };

  const exercisesPane = (): React.ReactNode => {
    const conceptIds = new Set(exerciseChapterConcepts.flatMap(({ id }) => id === undefined ? [] : [id]));
    const generatedWithoutConcept = exerciseChapterExercises.filter(({ conceptId, source }) => source === 'generated' && (conceptId === undefined || !conceptIds.has(conceptId)));
    const missingConceptIndexes = missingGeneratedExerciseConceptIndexes(exerciseChapterConcepts, exerciseChapterExercises);

    return <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'><span>{isExerciseChapterLoading ? 'Loading chapter exercises…' : 'Exercises grouped by concept'}</span></div>
      {!isExerciseChapterLoading && !!missingConceptIndexes.length && <div className='missingExerciseNavigation'>
        <span>Missing exercises for concepts:</span>
        <span className='missingExerciseLinks'>{missingConceptIndexes.map((conceptIndex, missingIndex) => <React.Fragment key={conceptReferenceKey(exerciseChapterConcepts[conceptIndex])}>
          {missingIndex > 0 && <span aria-hidden='true'>, </span>}
          <button
            aria-label={`Go to concept ${conceptIndex + 1}, missing an exercise`}
            onClick={() => focusExerciseConcept(conceptIndex)}
            type='button'
          >{conceptIndex + 1}</button>
        </React.Fragment>)}</span>
      </div>}
      <div
        className='conceptsOutput'
        ref={exerciseConceptsOutputRef}
      >
        <h3>{currentExerciseChapter?.title || 'Chapter not identified'}</h3>
        {!currentExerciseChapter
          ? <p className='emptyOutput'>No processed chapters are available.</p>
          : <>
            {exerciseChapterConcepts.map((concept, conceptIndex) => {
              const generated = exerciseChapterExercises.filter(({ conceptId, source }) => source === 'generated' && concept.id !== undefined && conceptId === concept.id);

              return <section
                className='conceptExerciseGroup exerciseConceptCard'
                data-concept-rank={conceptIndex + 1}
                key={conceptReferenceKey(concept)}
                tabIndex={-1}
              >
                <h4><span className='conceptExerciseRank'>{conceptIndex + 1}.</span> <SpanWithTags content={concept.title} /></h4>
                {concept.description && <p><SpanWithTags content={concept.description} /></p>}
                {generated.length ? <ul className='exerciseList'>{generated.map(exerciseItem)}</ul> : <p className='emptyOutput'>No generated exercises for this concept.</p>}
              </section>;
            })}
            {!!generatedWithoutConcept.length && <section className='conceptExerciseGroup exerciseConceptCard'>
              <h4>Other generated exercises</h4>
              <ul className='exerciseList'>{generatedWithoutConcept.map(exerciseItem)}</ul>
            </section>}
          </>}
      </div>
    </div>;
  };

  const currentFixConceptsReviewChapter = fixConceptsReview?.chapters[Math.min(fixConceptsReviewChapterIndex, Math.max(0, fixConceptsReview.chapters.length - 1))];
  const fixConceptsReviewConceptCard = (concept: BookConcept, conceptNumber: number, action?: React.ReactNode): React.ReactNode => {
    const displayPage = conceptDisplayPage(concept);

    return <div className='fixConceptsReviewCard'>
      <div className='fixConceptsReviewConceptHeading'>
        <strong><span className='conceptNumber'>{conceptNumber}.</span> <SpanWithTags content={concept.title} /></strong>
        {(displayPage !== undefined || action) && <span className='fixConceptsReviewMeta'>
          {displayPage !== undefined && <span className='fixConceptsReviewPage'>Page {displayPage}</span>}
          {action}
        </span>}
      </div>
      {concept.description && <p><SpanWithTags content={concept.description} /></p>}
    </div>;
  };
  const fixConceptsReviewRows = (reviewChapter: FixConceptsReviewChapter): React.ReactNode => {
    if (!reviewChapter.before.length && !reviewChapter.missing.length) {
      return <p className='fixConceptsReviewEmpty'>No concepts in this chapter.</p>;
    }

    const removedKeys = new Set(reviewChapter.removed.map(conceptReferenceKey));

    return <>
      {reviewChapter.before.map((concept, index) => {
        const isRemoved = removedKeys.has(conceptReferenceKey(concept));

        return isRemoved
          ? <div
            className='fixConceptsReviewRow isRemoval'
            key={`existing-${conceptReferenceKey(concept)}`}
          >
            <div className='fixConceptsReviewCell isBefore'>
              <span className='fixConceptsReviewChangeLabel'>Before</span>
              {fixConceptsReviewConceptCard(concept, index + 1)}
            </div>
            <div className='fixConceptsReviewCell isAfter'>
              <span className='fixConceptsReviewChangeLabel'>After</span>
              <div className='fixConceptsReviewRemovedAfter'>
                <span>Concept will be removed</span>
                <Button
                  isDisabled={isApplyingFixConceptsReview}
                  label='Keep'
                  onClick={() => toggleFixConceptsReviewRemoval(fixConceptsReviewChapterIndex, concept)}
                />
              </div>
            </div>
          </div>
          : <div
            className='fixConceptsReviewRow isUnchanged'
            key={`existing-${conceptReferenceKey(concept)}`}
          >
            <div className='fixConceptsReviewCell'>{fixConceptsReviewConceptCard(concept, index + 1, <Button
              icon='trash'
              isDisabled={isApplyingFixConceptsReview || concept.id === undefined}
              label='Delete'
              onClick={() => toggleFixConceptsReviewRemoval(fixConceptsReviewChapterIndex, concept)}
            />)}</div>
          </div>;
      })}
      {reviewChapter.missing.map((concept, missingIndex) => <div
        className='fixConceptsReviewRow'
        key={`proposed-${concept.pageNumber}-${concept.title}-${missingIndex}`}
      >
        <div className='fixConceptsReviewCell isBefore'>
          <span className='fixConceptsReviewChangeLabel'>Before</span>
          <div className='fixConceptsReviewMissingBefore'>Not present before</div>
        </div>
        <div className='fixConceptsReviewCell isAfter'>
          <span className='fixConceptsReviewChangeLabel'>After</span>
          <div className='fixConceptsReviewCard isProposed'>
            <div className='fixConceptsReviewConceptHeading'>
              <strong><span className='conceptNumber'>{reviewChapter.before.length + missingIndex + 1}.</span> <SpanWithTags content={concept.title} /></strong>
              <span className='fixConceptsReviewMeta'>
                <span className='fixConceptsReviewProposed'>Proposed</span>
                <span className='fixConceptsReviewPage'>Page {concept.pageNumber}</span>
                <Button
                  icon='trash'
                  isDisabled={isApplyingFixConceptsReview}
                  label='Remove'
                  onClick={() => removeFixConceptsReviewConcept(fixConceptsReviewChapterIndex, missingIndex)}
                />
              </span>
            </div>
            <p><SpanWithTags content={concept.description} /></p>
          </div>
        </div>
      </div>)}
    </>;
  };
  const deduplicateConceptCard = (concept: BookConcept, chapterId: number, chapterTitle: string, action?: React.ReactNode): React.ReactNode => <div className='fixConceptsReviewCard'>
    <div className='fixConceptsReviewConceptHeading'>
      <strong><SpanWithTags content={concept.title} /></strong>
      <span className='fixConceptsReviewMeta'>
        <span className='fixConceptsReviewPage'>Chapter {chapterId}</span>
        {action}
      </span>
    </div>
    <p><strong>{chapterTitle || 'Untitled chapter'}</strong>{conceptDisplayPage(concept) !== undefined ? ` — page ${conceptDisplayPage(concept)}` : ''}</p>
    {concept.description && <p><SpanWithTags content={concept.description} /></p>}
  </div>;

  return (
    <StyledReader className={`bookReader${isMaximized ? ' isMaximized' : ''}`}>
      {editingChapter && <ChapterTitleEditor
        chapter={editingChapter}
        language={book.language}
        onClose={closeChapterEditor}
        onError={setError}
        onSaved={refreshAfterChapterRename}
      />}
      {deduplicateConceptsReview && !autoRunAll && <Modal
        header='Review Deduplicate concepts changes'
        onClose={discardDeduplicateConceptsReview}
        size='large'
      >
        <Modal.Content>
          <FixConceptsReviewContent>
            <div className='fixConceptsReviewIntro'>
              <p><strong>No concept changes have been saved yet.</strong> The duplicate review ran twice, then combined both result sets. Checked {deduplicateConceptsReview.checkedConceptCount} concepts across the whole book and found {deduplicateConceptsReview.pairs.length} duplicate deletion{deduplicateConceptsReview.pairs.length === 1 ? '' : 's'}.</p>
              <p>For every duplicate group, the concept with the lowest chapter id is kept; ties inside the same chapter are broken by the lowest concept id. Every other concept in the group is selected for deletion.</p>
            </div>
            <div className='fixConceptsReviewComparison'>
              <div className='fixConceptsReviewConcepts'>
                {deduplicateConceptsReview.pairs.length
                  ? deduplicateConceptsReview.pairs.map((pair, index) => <div
                    className='fixConceptsReviewRow'
                    key={`deduplicate-${pair.deleted.id ?? index}`}
                  >
                    <div className='fixConceptsReviewCell isBefore'>
                      <span className='fixConceptsReviewChangeLabel'>Keep — canonical concept</span>
                      {deduplicateConceptCard(pair.kept, pair.keptChapterId, pair.keptChapterTitle)}
                    </div>
                    <div className='fixConceptsReviewCell isAfter'>
                      <span className='fixConceptsReviewChangeLabel'>{pair.selected ? 'Delete — duplicate' : 'Keep — deletion excluded'}</span>
                      {deduplicateConceptCard(pair.deleted, pair.deletedChapterId, pair.deletedChapterTitle, <Button
                        icon={pair.selected ? undefined : 'trash'}
                        isDisabled={isApplyingDeduplicateConceptsReview || pair.deleted.id === undefined}
                        label={pair.selected ? 'Keep' : 'Delete'}
                        onClick={() => pair.deleted.id !== undefined && toggleDeduplicateConceptDeletion(pair.deleted.id)}
                      />)}
                    </div>
                  </div>)
                  : <p className='fixConceptsReviewEmpty'>No clear duplicate concepts were found.</p>}
              </div>
            </div>
            <Button.Group>
              <Button
                icon='times'
                isDisabled={isApplyingDeduplicateConceptsReview}
                label='Discard changes'
                onClick={discardDeduplicateConceptsReview}
              />
              <Button
                icon='check'
                isDisabled={isApplyingDeduplicateConceptsReview}
                label={isApplyingDeduplicateConceptsReview ? 'Applying…' : 'Apply changes'}
                onClick={() => { void applyDeduplicateConceptsReview(); }}
              />
            </Button.Group>
          </FixConceptsReviewContent>
        </Modal.Content>
      </Modal>}
      {fixConceptsReview && currentFixConceptsReviewChapter && !autoRunAll && <Modal
        header='Review Fix concepts changes'
        onClose={discardFixConceptsReview}
        size='large'
      >
        <Modal.Content>
          <FixConceptsReviewContent>
          <div className='fixConceptsReviewIntro'>
            <p><strong>No concept changes have been saved yet.</strong> Each chapter was checked twice before combining these proposals, including same-chapter duplicate checks that can propose existing concepts for deletion.</p>
            <label>Chapter <select
              aria-label='Review Fix concepts chapter'
              disabled={isApplyingFixConceptsReview}
              onChange={({ target }) => setFixConceptsReviewChapterIndex(Number(target.value))}
              value={fixConceptsReviewChapterIndex}
            >
              {fixConceptsReview.chapters.map(({ chapter, missing, removed }, index) => <option
                key={fixConceptsChapterKey(chapter)}
                value={index}
              >{chapter.title || 'Chapter not identified'} ({missing.length} add, {removed.length} remove)</option>)}
            </select><span>{fixConceptsReviewChapterIndex + 1} of {fixConceptsReview.chapters.length}</span></label>
          </div>
          <div className='fixConceptsReviewComparison'>
            <div className='fixConceptsReviewConcepts'>{fixConceptsReviewRows(currentFixConceptsReviewChapter)}</div>
          </div>
          <section className='fixConceptsDifference'>
            <h3>Difference</h3>
            {currentFixConceptsReviewChapter.missing.length || currentFixConceptsReviewChapter.removed.length
              ? <>
                <p>{currentFixConceptsReviewChapter.missing.length} concept{currentFixConceptsReviewChapter.missing.length === 1 ? '' : 's'} selected to add and {currentFixConceptsReviewChapter.removed.length} existing concept{currentFixConceptsReviewChapter.removed.length === 1 ? '' : 's'} selected to remove. Use Remove/Delete or Keep above to adjust the final changes before saving.</p>
                {!!currentFixConceptsReviewChapter.missing.length && <>
                  <h4>Add</h4>
                  <ul>{currentFixConceptsReviewChapter.missing.map((concept, index) => <li key={`add-${concept.pageNumber}-${concept.title}-${index}`}><strong><SpanWithTags content={concept.title} /></strong> — page {concept.pageNumber}</li>)}</ul>
                </>}
                {!!currentFixConceptsReviewChapter.removed.length && <>
                  <h4>Remove</h4>
                  <ul>{currentFixConceptsReviewChapter.removed.map((concept) => <li key={`remove-${conceptReferenceKey(concept)}`}><strong><SpanWithTags content={concept.title} /></strong>{conceptDisplayPage(concept) !== undefined ? ` — page ${conceptDisplayPage(concept)}` : ''}</li>)}</ul>
                </>}
              </>
              : <p>No changes are proposed for this chapter. You can still mark an existing concept for deletion if it does not belong here.</p>}
          </section>
          {!!fixConceptsReview.failedChapters.length && <p className='fixConceptsReviewWarning'>
            {fixConceptsReview.failedChapters.length} of {fixConceptsReview.targetChapterCount} chapter{fixConceptsReview.failedChapters.length === 1 ? '' : 's'} could not be prepared and will remain marked for retry if you apply the reviewed changes.
          </p>}
          <Button.Group>
            <Button
              icon='times'
              isDisabled={isApplyingFixConceptsReview}
              label='Discard changes'
              onClick={discardFixConceptsReview}
            />
            <Button
              icon='check'
              isDisabled={isApplyingFixConceptsReview}
              label={isApplyingFixConceptsReview ? 'Applying…' : 'Apply changes'}
              onClick={() => { void applyFixConceptsReview(); }}
            />
          </Button.Group>
          </FixConceptsReviewContent>
        </Modal.Content>
      </Modal>}
      {isMathpixKeyPromptOpen && <Modal
        header='Mathpix API key'
        onClose={closeMathpixKeyPrompt}
        size='small'
      >
        <Modal.Content>
          <p>Enter your Mathpix API key to recognize {recognitionTarget === 'all' ? 'all pages' : 'this page'} and create MMD ZIPs.</p>
          <p>
            Get your API key from <a
              href='https://console.mathpix.com/'
              rel='noreferrer'
              target='_blank'
            >Mathpix Console</a>.
          </p>
          <Input
            autoFocus
            isFull
            label='Mathpix API key'
            onChange={setMathpixApiKey}
            onEnter={submitMathpixApiKey}
            placeholder='Enter your API key'
            type='password'
            value={mathpixApiKey}
          />
          <Button.Group>
            <Button
              icon='check'
              isDisabled={!mathpixApiKey.trim()}
              label='Save key'
              onClick={submitMathpixApiKey}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isLanguageDetectionConfirmationOpen && !autoRunAll && <StageRunPricePopup
        header='Detect book language'
        onClose={closeLanguageDetectionConfirmation}
        onRun={confirmLanguageDetection}
      >
        <p>Detect the primary language? You can change the result manually afterward.</p>
        <AiPriceEstimate estimate={languageDetectionEstimate} />
        <OpenRouterModelSelector
          className='modelSelect'
          onChange={setSelectedLanguageModel}
          value={selectedLanguageModel}
        />
      </StageRunPricePopup>}
      {isSubjectDetectionConfirmationOpen && !autoRunAll && <StageRunPricePopup
        header='Detect book subject'
        onClose={closeSubjectDetectionConfirmation}
        onRun={confirmSubjectDetection}
      >
        <p>{automaticBookSubjectForLanguage(book.language)
          ? 'This book is not in English, so its subject will be set to na automatically. You can change the stored subject manually afterward.'
          : 'Detect the primary subject? You can change the result manually afterward.'}</p>
        <AiPriceEstimate estimate={subjectDetectionEstimate} />
        {!automaticBookSubjectForLanguage(book.language) && <OpenRouterModelSelector
          className='modelSelect'
          onChange={setSelectedSubjectModel}
          value={selectedSubjectModel}
        />}
      </StageRunPricePopup>}
      {isAgeDetectionConfirmationOpen && !autoRunAll && <StageRunPricePopup
        header='Detect learner age'
        onClose={closeAgeDetectionConfirmation}
        onRun={confirmAgeDetection}
      >
        <p>Detect one typical learner age? The result can be changed manually afterward.</p>
        <AiPriceEstimate estimate={ageDetectionEstimate} />
        <OpenRouterModelSelector
          className='modelSelect'
          onChange={setSelectedAgeModel}
          value={selectedAgeModel}
        />
      </StageRunPricePopup>}
      {isPageGenerationConfirmationOpen && <StageRunPricePopup
        header='Generate concepts'
        onClose={closePageGenerationConfirmation}
        onRun={confirmPageGeneration}
      >
        <AiPriceEstimate estimate={chapterGenerationEstimate} />
        <p>This sends the whole chapter to the AI in one request, deduplicates concepts across its pages, and saves each concept on the page where it was first introduced. Exercises in the book are ignored; Abilities are generated directly from Concepts.</p>
        <OpenRouterModelSelector
          className='modelSelect'
          isDisabled={processingPage !== undefined || isGeneratingAllConcepts || isIdentifyingChapters || isRecognizingAll}
          onChange={setSelectedModel}
          requiredInputModalities={['image']}
          value={selectedModel}
        />
      </StageRunPricePopup>}
      {processingPopupStatus && <ProcessingPopup
        label={t(processingPopupStatus.label)}
        onAbort={abortProcessing}
        overallProgress={autoRunAll && autoRunProgress ? autoRunProgress : undefined}
        progressTotal={processingPopupStatus.progressTotal}
        progressValue={processingPopupStatus.progressValue}
        spent={processingPopupStatus.spent}
      />}
      <Skills
        autoRunAll={autoRunAll}
        autoRunStartKey={autoRunStartKey}
        autoRunSkipRefineChapters={autoRunSkipRefineChapters}
        book={book}
        externalAutoRunBusy={hasReaderProcessing}
        externalRefreshToken={skillsRefreshToken}
        onAction={revealPane}
        onAbortAutoRun={onAbortFastForward}
        onAutoRunComplete={onAutoRunComplete}
        onAutoRunProcessingChange={setAutoRunProcessing}
        onAutoRunProgressChange={setAutoRunProgress}
        onBookChange={onBookChange}
        onContentChange={onSkillsContentChange}
        onEntityCountsChange={onSkillsEntityCountsChange}
        onPipelineSelectionChange={setSelectedPipelineKey}
        pipelineControls={<>
          <Button
            aria-label={t('Run all remaining stages')}
            className='pipelineFastForwardButton'
            icon='fast-forward'
            isDisabled={isPriceDisabled || autoRunAll || !selectedPipelineKey}
            onClick={() => onFastForward(selectedPipelineKey)}
            title={t('Run all remaining stages')}
          />
          <Button
            className='pipelinePriceButton'
            icon='chart-simple'
            isDisabled={isPriceDisabled}
            label={t('Statistics')}
            onClick={onPrice}
          />
          <Button
            className='pipelineZoomButton'
            icon={isMaximized ? 'compress' : 'search-plus'}
            onClick={() => setIsMaximized((value) => !value)}
          />
        </>}
        pipelineOnly
        pipelinePrefix={processingToolbar}
        pipelineSuffix={processingToolbarAfterFixImages}
        view='conceptsSkills'
      />
      {error && <p
        className='readerError'
        role='alert'
      >{error}</p>}
      <div
        className='readerTabs'
        role='tablist'
      >
        {([
          ['text', 'PDF/Text', true, undefined],
          ['language', 'Language', revealedPanes.has('language') || Boolean(book.language), undefined],
          ['subject', 'Subject', revealedPanes.has('subject') || Boolean(book.subject), undefined],
          ['age', 'Age', revealedPanes.has('age') || book.age !== undefined, undefined],
          ['chapters', 'Chapters', revealedPanes.has('chapters') || isBookProcessingStageComplete(book, 'chapters'), chapters.length],
          ['textConcepts', 'Concepts', revealedPanes.has('textConcepts') || isBookProcessingStageComplete(book, 'concepts'), entityCounts.concepts],
          ['embeddings', 'Embedings', revealedPanes.has('embeddings') || isBookProcessingStageComplete(book, 'embeddings'), undefined],
          ['conceptExercises', 'Exercises', revealedPanes.has('conceptExercises'), entityCounts.exercises],
          ['preExercisesExercises', 'Abilities', revealedPanes.has('preExercisesExercises') || isBookProcessingStageComplete(book, 'abilities'), entityCounts.abilities],
          ['standards', 'Standards', revealedPanes.has('standards') || isBookProcessingStageComplete(book, 'standards') || Object.keys(standardsByChapter).length > 0, undefined],
          ['skillsCourse', 'Course', revealedPanes.has('skillsCourse') || isBookProcessingStageComplete(book, 'abilities'), undefined]
        ] as Array<[ReaderPane, string, boolean, number | undefined]>).filter(([, , isVisible]) => isVisible).map(([pane, label, , count]) => (
          <button
            aria-selected={activePane === pane}
            className={activePane === pane ? 'active' : ''}
            id={`${pane}-tab`}
            key={pane}
            onClick={() => setActivePane(pane)}
            role='tab'
            type='button'
          >{label}{count === undefined ? '' : ` (${count})`}</button>
        ))}
      </div>
      <div
        aria-labelledby={`${activePane}-tab`}
        className={`readerColumns${activePane === 'textConcepts' ? ' conceptColumns' : ''}${
          activePane === 'skillsCourse' ? ' courseColumns' : ''
        }`}
        role='tabpanel'
      >
        {(activePane === 'pdf' || activePane === 'text' || activePane === 'chapters') && <div className='pageNavigation'>
          <Button
            icon='arrow-left'
            isDisabled={pageNumber <= 1}
            onClick={() => goToPage(pageNumber - 1)}
          />
          <label>Page <input
            max={totalPages || 1}
            min={1}
            onBlur={submitPageInput}
            onChange={({ target }) => setPageInput(target.value)}
            onKeyDown={({ key }) => key === 'Enter' && submitPageInput()}
            type='number'
            value={pageInput}
          /><span>of {totalPages || '…'}</span></label>
          <Button
            icon='arrow-right'
            isDisabled={!totalPages || pageNumber >= totalPages}
            onClick={() => goToPage(pageNumber + 1)}
          />
          {activePane === 'text' && showUnrecognizedPages && <select
            aria-label='Unrecognized pages'
            className='unrecognizedPages'
            onChange={({ target }) => {
              const requestedPage = Number(target.value);

              if (Number.isInteger(requestedPage) && requestedPage > 0) {
                goToPage(requestedPage);
              }
            }}
            value={unrecognizedPageNumbers.includes(pageNumber) ? pageNumber : ''}
          >
            <option value=''>Unrecognized pages ({unrecognizedPageNumbers.length})</option>
            {unrecognizedPageNumbers.map((unrecognizedPageNumber) => <option
              key={unrecognizedPageNumber}
              value={unrecognizedPageNumber}
            >Page {unrecognizedPageNumber}</option>)}
          </select>}
          <input
            aria-label='Navigate pages'
            className='pageScroller'
            disabled={!totalPages}
            max={totalPages || 1}
            min={1}
            onChange={({ target }) => goToPage(Number(target.value))}
            type='range'
            value={pageNumber}
          />
        </div>}
        {(activePane === 'standards' || (activePane === 'embeddings' && embeddingHeatmapMode === 'chapter')) && <div className='chapterNavigation'>
          <Button
            icon='arrow-left'
            isDisabled={standardsChapterIndex <= 0}
            onClick={() => changeStandardsChapter(standardsChapterIndex - 1)}
          />
          <div className='chapterSelectGroup'>
            <label>Chapter <select
              aria-label={activePane === 'embeddings' ? 'Navigate embedding chapters' : 'Navigate standards chapters'}
              disabled={!conceptChapters.length}
              onChange={({ target }) => changeStandardsChapter(Number(target.value))}
              value={conceptChapters.length ? standardsChapterIndex : ''}
            >
              {conceptChapters.map(({ chapterId, pageNumbers, title }, index) => {
                const isMissing = activePane === 'standards' && !hasChapterStandards(standardsByChapter[standardsChapterKey(chapterId, title, pageNumbers)]);

                return <option
                  key={standardsChapterKey(chapterId, title, pageNumbers)}
                  value={index}
                >{activePane === 'standards' ? (isMissing ? '⚠ Missing standards — ' : '✓ ') : ''}{title || 'Chapter not identified'}</option>;
              })}
            </select></label>
            <Button
              aria-label='Edit chapter name'
              icon='edit'
              isDisabled={conceptChapters[standardsChapterIndex]?.chapterId === undefined}
              onClick={() => openChapterEditor(conceptChapters[standardsChapterIndex]?.chapterId)}
            />
          </div>
          <span>{conceptChapters.length ? `${standardsChapterIndex + 1} of ${conceptChapters.length}` : 'No chapters'}</span>
          <Button
            icon='arrow-right'
            isDisabled={!conceptChapters.length || standardsChapterIndex >= conceptChapters.length - 1}
            onClick={() => changeStandardsChapter(standardsChapterIndex + 1)}
          />
        </div>}
        {activePane === 'conceptExercises' && <div className='chapterNavigation'>
          <Button
            icon='arrow-left'
            isDisabled={exerciseChapterIndex <= 0}
            onClick={() => changeExerciseChapter(exerciseChapterIndex - 1)}
          />
          <div className='chapterSelectGroup'>
            <label>Chapter <select
              aria-label='Navigate chapters'
              disabled={!exerciseChapters.length}
              onChange={({ target }) => changeExerciseChapter(Number(target.value))}
              value={exerciseChapters.length ? exerciseChapterIndex : ''}
            >
              {exerciseChapters.map((chapter, index) => {
                const missingCount = exerciseChapterMissingCounts.get(exerciseChapterNavigationKey(chapter));
                const title = chapter.title || 'Chapter not identified';

                return <option
                  key={`${chapter.title}:${index}`}
                  value={index}
                >{title}{missingCount ? ` (${missingCount} exercise${missingCount === 1 ? '' : 's'} missing)` : ''}</option>;
              })}
            </select></label>
            <Button
              aria-label='Edit chapter name'
              icon='edit'
              isDisabled={exerciseChapters[exerciseChapterIndex]?.id === undefined}
              onClick={() => openChapterEditor(exerciseChapters[exerciseChapterIndex]?.id)}
            />
          </div>
          <span>{exerciseChapters.length ? `${exerciseChapterIndex + 1} of ${exerciseChapters.length}` : 'No chapters'}</span>
          <Button
            icon='arrow-right'
            isDisabled={!exerciseChapters.length || exerciseChapterIndex >= exerciseChapters.length - 1}
            onClick={() => changeExerciseChapter(exerciseChapterIndex + 1)}
          />
        </div>}
        {activePane === 'pdf'
          ? <div
            className='pageArea fullWidthPage'
            ref={pageAreaRef}
          ><canvas ref={canvasRef} /></div>
          : activePane === 'text'
            ? <>
              <div
                className='pageArea'
                ref={pageAreaRef}
              ><canvas ref={canvasRef} /></div>
              <div
                className={`detailsArea${renderedPageHeight ? ' hasPageHeight' : ''}`}
                style={{ '--page-height': renderedPageHeight ? `${renderedPageHeight}px` : 'auto' } as React.CSSProperties}
              >
                {recognizedTextPane()}
              </div>
            </>
            : activePane === 'language'
              ? <div className='detailsArea fullWidthDetails languageDetails'>{languagePane()}</div>
              : activePane === 'subject'
                ? <div className='detailsArea fullWidthDetails languageDetails'>{subjectPane()}</div>
                : activePane === 'age'
                  ? <div className='detailsArea fullWidthDetails languageDetails'>{agePane()}</div>
                  : activePane === 'chapters'
                    ? <>
                      <div
                        className='pageArea'
                        ref={pageAreaRef}
                      ><canvas ref={canvasRef} /></div>
                      <div className='detailsArea'>{chaptersPane()}</div>
                    </>
                : activePane === 'textConcepts'
                  ? <>
                    <div className='conceptPaneColumn'>
                      <div className='pageNavigation compactPageNavigation conceptPaneNavigation'>
                        <Button
                          icon='arrow-left'
                          isDisabled={pageNumber <= 1}
                          onClick={() => goToPage(pageNumber - 1)}
                        />
                        <label>Page <input
                          max={totalPages || 1}
                          min={1}
                          onBlur={submitPageInput}
                          onChange={({ target }) => setPageInput(target.value)}
                          onKeyDown={({ key }) => key === 'Enter' && submitPageInput()}
                          type='number'
                          value={pageInput}
                        /><span>of {totalPages || '…'}</span></label>
                        <Button
                          icon='arrow-right'
                          isDisabled={!totalPages || pageNumber >= totalPages}
                          onClick={() => goToPage(pageNumber + 1)}
                        />
                      </div>
                      <div
                        className='pageArea'
                        ref={pageAreaRef}
                      ><canvas ref={canvasRef} /></div>
                    </div>
                    <div className='conceptPaneColumn'>
                      <div className='chapterNavigation conceptPaneNavigation'>
                        <Button
                          icon='arrow-left'
                          isDisabled={!conceptChapters.length || conceptChapterIndex <= 0}
                          onClick={() => changeConceptChapter(conceptChapterIndex - 1)}
                        />
                        <div className='chapterSelectGroup'>
                          <label>Chapter <select
                            aria-label='Navigate chapters'
                            disabled={!conceptChapters.length}
                            onChange={({ target }) => changeConceptChapter(Number(target.value))}
                            value={conceptChapters.length ? conceptChapterIndex : ''}
                          >
                            {conceptChapters.map(({ chapterId, pageNumbers, title }, index) => {
                              const chapterKey = standardsChapterKey(chapterId, title, pageNumbers);
                              const conceptCount = conceptCountsByChapter.get(chapterKey) ?? 0;

                              return <option
                                key={chapterKey}
                                value={index}
                              >{fixConceptsChapterStatuses[fixConceptsChapterKey({ chapterId, pageNumbers, title })] === 'fixed' ? '✓ ' : ''}{title || 'Chapter not identified'} {'('}{conceptCount}{')'}</option>;
                            })}
                          </select></label>
                          <Button
                            aria-label='Edit chapter name'
                            icon='edit'
                            isDisabled={conceptChapters[conceptChapterIndex]?.chapterId === undefined}
                            onClick={() => openChapterEditor(conceptChapters[conceptChapterIndex]?.chapterId)}
                          />
                        </div>
                        <span>{conceptChapters.length ? `${conceptChapterIndex + 1} of ${conceptChapters.length}` : 'No chapters'}</span>
                        <Button
                          icon='arrow-right'
                          isDisabled={!conceptChapters.length || conceptChapterIndex >= conceptChapters.length - 1}
                          onClick={() => changeConceptChapter(conceptChapterIndex + 1)}
                        />
                      </div>
                      <div
                        className='detailsArea'
                        style={{ '--page-height': renderedPageHeight ? `${renderedPageHeight}px` : 'auto' } as React.CSSProperties}
                      >
                        {conceptsPane()}
                      </div>
                    </div>
                  </>
                  : activePane === 'standards'
                    ? <div className='detailsArea fullWidthDetails'>{standardsPane()}</div>
                    : activePane === 'embeddings'
                      ? <div className='detailsArea fullWidthDetails'>{embeddingsPane()}</div>
                    : activePane === 'conceptExercises'
                      ? <div className='detailsArea fullWidthDetails'>{exercisesPane()}</div>
                      : activePane === 'conceptsSkills'
                      ? <>
                        <div className='skillsArea'>
                          <Skills
                            book={book}
                            externalRefreshToken={skillsRefreshToken}
                            onAction={revealPane}
                            onBookChange={onBookChange}
                            onEntityCountsChange={onSkillsEntityCountsChange}
                            showPipeline={false}
                            view='conceptsSkills'
                          />
                        </div>
                      </>
                      : activePane === 'preExercisesExercises'
                        ? <div className='skillsArea'><Skills
                          book={book}
                          externalRefreshToken={skillsRefreshToken}
                          key={`abilities-${book.id}-${skillsRefreshToken}`}
                          onAction={revealPane}
                          onBookChange={onBookChange}
                          onEntityCountsChange={onSkillsEntityCountsChange}
                          showPipeline={false}
                          view='preExercisesExercises'
                        /></div>
                        : <div className='courseArea'><SkillsCourse book={book} key={book.id} onBookChange={onBookChange} /></div>}
      </div>
    </StyledReader>
  );
}
