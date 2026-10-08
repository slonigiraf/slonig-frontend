// Copyright 2021-2026 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookProcessingWorker } from '@slonigiraf/db';
import { requestBookProcessingWorkerAbort, subscribeBookProcessingWorkers } from '@slonigiraf/db';
import { ProcessingPopup } from '@slonigiraf/app-laws';
import React, { useEffect, useState } from 'react';
import { Spinner, styled } from '@polkadot/react-components';

import { useTranslation } from '../translate.js';


// Keep the user-facing worker stages in the normal translation-key extraction flow.
function translateWorkerStage (label: string, t: (key: string) => string): string {
  switch (label) {
    case 'Recognizing pages': return t('Recognizing pages');
    case 'Detecting book language': return t('Detecting book language');
    case 'Detecting book subject': return t('Detecting book subject');
    case 'Detecting learner age': return t('Detecting learner age');
    case 'Identifying chapters': return t('Identifying chapters');
    case 'Extracting concepts by chapter': return t('Extracting concepts by chapter');
    case 'Finding missing chapter concepts': return t('Finding missing chapter concepts');
    case 'Calculating concept Embeddings': return t('Calculating concept Embeddings');
    case 'Finding duplicate concepts': return t('Finding duplicate concepts');
    case 'Sorting concepts by ZPD': return t('Sorting concepts by ZPD');
    case 'Clustering concepts into thematic chapters': return t('Clustering concepts into thematic chapters');
    case 'Generating exercises': return t('Generating exercises');
    case 'Fixing Exercise errors': return t('Fixing Exercise errors');
    case 'Generating Abilities': return t('Generating Abilities');
    case 'Fixing Ability errors': return t('Fixing Ability errors');
    case 'Generating Ability images': return t('Generating Ability images');
    case 'Reviewing and fixing Ability images': return t('Reviewing and fixing Ability images');
    case 'Matching standards to chapter concepts': return t('Matching standards to chapter concepts');
    case 'Fixing standards assignments': return t('Fixing standards assignments');
    default: return t(label);
  }
}

function BookProcessingWorkerDock (): React.ReactElement | null {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<BookProcessingWorker[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>();

  useEffect(() => subscribeBookProcessingWorkers(setWorkers, { activeOnly: true }), []);

  useEffect(() => {
    // Reattach to durable jobs after a document reload.
    void import('@slonigiraf/app-laws')
      .then(({ resumeBookProcessingWorkers }) => resumeBookProcessingWorkers())
      .catch((error: unknown) => console.error('Unable to resume book-processing workers.', error));
  }, []);

  useEffect(() => {
    if (!workers.length) {
      setIsOpen(false);
      setSelectedWorkerId(undefined);
    } else if (!selectedWorkerId || !workers.some(({ workerId }) => workerId === selectedWorkerId)) {
      setSelectedWorkerId(workers[0].workerId);
    }
  }, [selectedWorkerId, workers]);

  if (!workers.length) {
    return null;
  }

  const selected = workers.find(({ workerId }) => workerId === selectedWorkerId) ?? workers[0];

  return <DockRoot>
    <button
      aria-expanded={isOpen}
      aria-label={isOpen ? t('Minimize book processing statistics') : t('Show {{count}} active book processing workers', { replace: { count: workers.length } })}
      className='workerSpinnerButton'
      onClick={() => {
        if (!isOpen) {
          window.dispatchEvent(new Event('book-processing-worker-popup-open'));
        }
        setIsOpen((value) => !value);
      }}
      title={t('Book processing workers')}
      type='button'
    >
      <Spinner className='workerSpinner' noLabel variant='mini' />
      {workers.length > 1 && <span className='workerCount'>{workers.length}</span>}
    </button>

    {isOpen && selected && <ProcessingPopup
      bookName={selected.bookName.trim() || t('Book {{id}}', { replace: { id: selected.bookId } })}
      label={translateWorkerStage(selected.stageLabel, t)}
      overallProgress={{
        completed: Math.min(selected.stageSequence?.length ?? 1, Math.max(0, selected.stageIndex ?? 0)),
        total: selected.stageSequence?.length ?? 1
      }}
      onAbort={() => requestBookProcessingWorkerAbort(selected.workerId).catch(console.error)}
      onMinimize={() => setIsOpen(false)}
      progressTotal={Math.max(1, selected.progressTotal)}
      progressValue={selected.progressValue}
      spent={selected.spent ?? 0}
    />}
  </DockRoot>;
}

const DockRoot = styled.div`
  /* Positioned in the page, not fixed to the viewport: scrolling hides it. */
  flex: 0 0 auto;
  margin-right: auto;
  position: relative;
  z-index: 1;

  .workerSpinnerButton {
    align-items: center;
    background: var(--bg-page);
    border: 1px solid var(--border-table);
    border-radius: 999px;
    box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.2);
    cursor: pointer;
    display: flex;
    height: 2.75rem;
    justify-content: center;
    padding: 0;
    position: relative;
    width: 2.75rem;
  }

  .workerSpinner.ui--Spinner { margin: 0; line-height: 0; }
  .workerSpinner.ui--Spinner img { height: 1.7rem; width: 1.7rem; }

  .workerCount {
    align-items: center;
    background: var(--color-primary);
    border-radius: 999px;
    color: white;
    display: flex;
    font-size: 0.68rem;
    font-weight: 700;
    height: 1.15rem;
    justify-content: center;
    min-width: 1.15rem;
    padding: 0 0.2rem;
    position: absolute;
    right: -0.3rem;
    top: -0.3rem;
  }
`;

export default React.memo(BookProcessingWorkerDock);
