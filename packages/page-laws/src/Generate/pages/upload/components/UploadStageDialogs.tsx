// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import React from 'react';

import { Toggle } from '@polkadot/react-components';

import type { UploadProcessing } from '../hooks/useUploadProcessing.js';

import OpenRouterEmbeddingModelSelector from '../../../../openrouter/components/EmbeddingModelSelector.js';
import OpenRouterModelSelector from '../../../../openrouter/components/ModelSelector.js';
import { MATHPIX_PDF_PAGE_PRICE_USD } from '../../../book/application/config.js';
import { AiPriceEstimate, UnitPriceEstimate } from '../../../shared/ui/PriceEstimate.js';
import StageRunPricePopup from '../../../shared/ui/StageRunPricePopup.js';
import { useTranslation } from '../../../../common/translate.js';
import { BookStatisticsModal, FastForwardPricePopup } from './UploadPriceModals.js';

interface UploadStageDialogsProps {
  processing: UploadProcessing;
  selectedBook?: Book;
}

export function UploadStageDialogs ({ processing, selectedBook }: UploadStageDialogsProps): React.ReactElement {
  const { t } = useTranslation();
  const { conceptGeneration, conceptOrganization, metadata, pricing, standardsExercises } = processing;
  const isFastForwardRunning = pricing.isFastForwardRunning;

  return <>
    {pricing.isFastForwardConfirmationOpen && <FastForwardPricePopup
      estimate={pricing.fastForwardEstimate}
      onClose={pricing.closeFastForwardConfirmation}
      onRun={pricing.confirmFastForward}
    />}
    {pricing.isPriceOpen && <BookStatisticsModal
      book={pricing.priceBook}
      externalCalls={pricing.priceExternalCalls}
      onClose={pricing.closePrice}
      stageTimes={pricing.priceStageTimes}
    />}
    {metadata.isRecognizeConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Recognize pages')}
      onClose={metadata.closeRecognizeConfirmation}
      onRun={metadata.confirmRecognize}
      runLabel={t('Run')}
    >
      <p>{t('Recognize every page in this book?')}</p>
      <UnitPriceEstimate
        count={metadata.recognizePageCount}
        lineLabel='Mathpix v3/pdf'
        title={t('Estimated Mathpix cost')}
        unitLabel='page'
        unitPriceUsd={MATHPIX_PDF_PAGE_PRICE_USD}
      />
    </StageRunPricePopup>}
    {metadata.isIdentifyChaptersConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Identify chapters')}
      onClose={metadata.closeIdentifyChaptersConfirmation}
      onRun={metadata.confirmIdentifyChapters}
      runLabel={t('Run')}
    >
      <p>{t('Use PDF bookmarks as chapter boundaries when available. Otherwise identify chapters from recognized page text.')}</p>
      <p>{t('If bookmarks are unavailable, page-text detection needs a book language and may use AI.')}</p>
      <AiPriceEstimate
        estimate={metadata.identifyChaptersEstimate}
        title={t('Estimated AI cost if page-text detection is needed')}
      />
      <p>{t('You can manually rename chapters, start a chapter on any page, merge chapters, or assign individual pages afterward.')}</p>
      <OpenRouterModelSelector
        className='batchModelSelect'
        modelLabel={t('Model')}
        onChange={processing.setGenerateAllConceptsModel}
        providerLabel={t('Provider')}
        value={processing.generateAllConceptsModel}
      />
    </StageRunPricePopup>}
    {conceptGeneration.isGenerateConceptsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Generate concepts')}
      onClose={conceptGeneration.closeGenerateConceptsConfirmation}
      onRun={conceptGeneration.confirmGenerateConcepts}
      runLabel={t('Run')}
    >
      <p>{t('Generate concepts chapter-by-chapter for this book? Each concept will be stored on the page where it is first introduced.')}</p>
      <Toggle
        isDisabled={!selectedBook || !conceptGeneration.hasChaptersMissingConcepts}
        label={t('Only for chapters missing concepts')}
        onChange={conceptGeneration.setGenerateOnlyMissingConcepts}
        value={conceptGeneration.generateOnlyMissingConcepts}
      />
      <AiPriceEstimate estimate={conceptGeneration.generateConceptsEstimate} />
      <OpenRouterModelSelector
        className='batchModelSelect'
        modelLabel={t('Model')}
        onChange={processing.setGenerateAllConceptsModel}
        providerLabel={t('Provider')}
        requiredInputModalities={['image']}
        value={processing.generateAllConceptsModel}
      />
    </StageRunPricePopup>}
    {conceptGeneration.isFixConceptsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Fix concepts')}
      onClose={conceptGeneration.closeFixConceptsConfirmation}
      onRun={conceptGeneration.confirmFixConcepts}
      runLabel={t('Run')}
    >
      <p>{t('Review each chapter’s source text and current concept list using the book topic, language, and learner age. Fix concepts can propose strongly implied missing concepts, flag existing concepts that clearly do not belong, and split bundled concepts into isolated skills by proposing the original for removal plus its narrower replacements for addition. You can add or remove concepts in the review before anything is saved.')}</p>
      <Toggle
        isDisabled={!conceptGeneration.hasFailedFixConceptChapters}
        label={t('Only retry chapters that failed the last Fix concepts run')}
        onChange={conceptGeneration.setFixOnlyFailedConcepts}
        value={conceptGeneration.fixOnlyFailedConcepts}
      />
      <AiPriceEstimate estimate={conceptGeneration.fixConceptsEstimate} />
      <OpenRouterModelSelector
        className='batchModelSelect'
        modelLabel={t('Model')}
        onChange={processing.setGenerateAllConceptsModel}
        providerLabel={t('Provider')}
        value={processing.generateAllConceptsModel}
      />
    </StageRunPricePopup>}
    {conceptGeneration.isEmbeddingsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Embedings')}
      onClose={conceptGeneration.closeEmbeddingsConfirmation}
      onRun={conceptGeneration.confirmEmbeddings}
      runLabel={t('Run')}
    >
      <p>{t('Calculate and cache embeddings for every current concept after Fix concepts. These vectors are used to shortlist likely duplicates before AI confirmation and are reused later when matching standards.')}</p>
      <AiPriceEstimate estimate={conceptGeneration.embeddingsEstimate} />
      <OpenRouterEmbeddingModelSelector
        className='batchModelSelect'
        label={t('Embedding model')}
        onChange={processing.setEmbeddingModel}
        value={processing.embeddingModel}
      />
    </StageRunPricePopup>}
    {conceptOrganization.isDeduplicateConceptsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Deduplicate concepts')}
      onClose={conceptOrganization.closeDeduplicateConceptsConfirmation}
      onRun={conceptOrganization.confirmDeduplicateConcepts}
      runLabel={t('Run')}
    >
      <p>{t('Use the cached concept Embedings to generate a small set of semantically close deletion candidates, then send only those candidates to the selected AI model for confirmation. Nothing is deleted until you review the confirmed duplicate groups. For every confirmed duplicate group, the concept with the lowest chapter id is kept; ties inside the same chapter are broken by the lowest concept id, and every other concept in the group is proposed for deletion.')}</p>
      <AiPriceEstimate estimate={conceptOrganization.deduplicateConceptsEstimate} />
      <OpenRouterModelSelector
        className='batchModelSelect'
        modelLabel={t('Model')}
        onChange={processing.setGenerateAllConceptsModel}
        providerLabel={t('Provider')}
        value={processing.generateAllConceptsModel}
      />
    </StageRunPricePopup>}
    {conceptOrganization.isSortConceptsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Sort concepts')}
      onClose={conceptOrganization.closeSortConceptsConfirmation}
      onRun={conceptOrganization.confirmSortConcepts}
      runLabel={t('Run')}
    >
      <p>{t('Sort each original chapter independently into a Zone of Proximal Development progression for the configured learner age. Concepts from different chapters are never included in the same sorting request or saved in the same reorder operation. Only the relative order inside each chapter may change; chapter boundaries stay fixed.')}</p>
      <AiPriceEstimate estimate={conceptOrganization.sortConceptsEstimate} />
      <OpenRouterModelSelector
        className='batchModelSelect'
        modelLabel={t('Model')}
        onChange={processing.setGenerateAllConceptsModel}
        providerLabel={t('Provider')}
        value={processing.generateAllConceptsModel}
      />
    </StageRunPricePopup>}
    {conceptOrganization.isRefineChaptersConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Refine chapters')}
      onClose={conceptOrganization.closeRefineChaptersConfirmation}
      onRun={conceptOrganization.confirmRefineChapters}
      runLabel={t('Run')}
    >
      <p>{t('Process each original chapter independently, clustering only the concepts that already belong to that chapter. Concepts from different original chapters are never placed in the same clustering request and can never be reordered together. Within each original chapter, Refine chapters may cut the already-sorted concept sequence into one, two, or three contiguous thematic groups, targeting roughly 7–10 concepts per resulting chapter when the themes support it.')}</p>
      <AiPriceEstimate estimate={conceptOrganization.refineChaptersEstimate} />
      <OpenRouterModelSelector
        className='batchModelSelect'
        modelLabel={t('Model')}
        onChange={processing.setGenerateAllConceptsModel}
        providerLabel={t('Provider')}
        value={processing.generateAllConceptsModel}
      />
    </StageRunPricePopup>}
    {standardsExercises.isStandardsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Standards')}
      onClose={standardsExercises.closeStandardsConfirmation}
      onRun={standardsExercises.confirmAssignStandards}
      runLabel={t('Run')}
    >
      <p>{t('Match standards for every chapter from its extracted concepts? The same embedding model selected in Embedings is used to embed the standards catalogs, while the cached concept vectors are reused to reduce every framework to the nearest candidates. Only those candidates are sent to the selected AI model three times, and a standard is kept when at least two runs agree.')}</p>
      <AiPriceEstimate estimate={standardsExercises.standardsEstimate} />
      <OpenRouterModelSelector
        className='batchModelSelect'
        modelLabel={t('Model')}
        onChange={processing.setStandardsModel}
        providerLabel={t('Provider')}
        value={processing.standardsModel}
      />
    </StageRunPricePopup>}
    {standardsExercises.isGenerateExercisesConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
      header={t('Generate exercises')}
      onClose={standardsExercises.closeGenerateExercisesConfirmation}
      onRun={standardsExercises.confirmGenerateExercises}
      runLabel={t('Run')}
    >
      <p>{t('Generate one succinct, transformation-first exercise per concept, keep one per non-overlapping book exercise, and skip book exercises already covered by concepts?')}</p>
      <Toggle
        isDisabled={!standardsExercises.hasConceptsMissingExercise}
        label={t('Only for concepts, missing an exercise')}
        onChange={standardsExercises.setGenerateOnlyMissingExercises}
        value={standardsExercises.generateOnlyMissingExercises}
      />
      <AiPriceEstimate estimate={standardsExercises.generateExercisesEstimate} />
      <OpenRouterModelSelector
        className='batchModelSelect'
        modelLabel={t('Model')}
        onChange={processing.setGenerateAllConceptsModel}
        providerLabel={t('Provider')}
        value={processing.generateAllConceptsModel}
      />
    </StageRunPricePopup>}
  </>;
}
