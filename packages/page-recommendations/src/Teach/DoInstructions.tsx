// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useCallback } from 'react';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button, Spinner } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { ValidatingAlgorithm } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';
import { InstructionsButtonsContainer, InstructionsButtonsGroup, InstructionsContainer, useIpfsContext } from '@slonigiraf/app-slonig-components';
import { LetterTemplate, putLetterTemplate, Reexamination, updateReexamination } from '@slonigiraf/db';
import { getIPFSDataFromContentID, parseJson, useInfo } from '@slonigiraf/app-slonig-components';
import { TutoringAlgorithm } from './TutoringAlgorithm.js';

interface Props {
  className?: string;
  entity: LetterTemplate | Reexamination;
  onResult: () => void;
  studentName: string | null;
  studentUsedSlonig?: boolean;
}

function DoInstructions({ className = '', entity, onResult, studentName, studentUsedSlonig = true }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [skill, setSkill] = useState<Skill>();
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();
  const { showInfo } = useInfo();
  const [isButtonClicked, setIsButtonClicked] = useState(false);

  const isLetterTemplate = useCallback((entity: LetterTemplate | Reexamination) => {
    return 'knowledgeId' in entity;
  }, []);

  const isReexamination = useCallback((entity: LetterTemplate | Reexamination) => {
    return !isLetterTemplate(entity);
  }, []);


  useEffect(() => {
    let isComponentMounted = true;

    async function fetchData() {
      if (isIpfsReady) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, entity.cid, 1);
          const skill: Skill = parseJson(skillContent);
          if (isComponentMounted) {
            setSkill(skill);
            if (isLetterTemplate(entity)) {
              const newAlgorithm = new TutoringAlgorithm(t, studentName, skill, !studentUsedSlonig);
              setAlgorithmStage(newAlgorithm.getBegin());
            } else {
              const newAlgorithm = new ValidatingAlgorithm(t, studentName, skill, entity);
              setAlgorithmStage(newAlgorithm.getBegin());
            }
          }
        } catch (e) {
          if (isComponentMounted) {
            setAlgorithmStage(undefined);
            onResult();
          }
        }
      }
    }

    fetchData();

    return () => {
      isComponentMounted = false;
    };
  }, [ipfs, entity, studentName]);

  const handleStageChange = async (nextStage: AlgorithmStage | null) => {
    if (nextStage !== null) {
      setIsButtonClicked(true);
      const now = (new Date).getTime();
      if (isReexamination(entity) && nextStage.type === 'reimburse') {
        showInfo(t('Bounty will be collected after the lesson ends.'));
        const failedReexamination: Reexamination = { ...entity, created: now, lastExamined: now, valid: false };
        await updateReexamination(failedReexamination);
        onResult();
      } else if (nextStage.type === 'skip') {
        onResult();
      } else if (
        isLetterTemplate(entity) &&
        (nextStage.type === 'success' || nextStage.type === 'next_skill')) {
        const preparedLetterTemplate: LetterTemplate = {
          ...entity,
          valid: nextStage.type === 'success',
          lastExamined: (new Date()).getTime(),
        };
        await putLetterTemplate(preparedLetterTemplate);
        onResult();
      } else if (isReexamination(entity) && nextStage.type === 'success') {
        const successfulReexamination: Reexamination = { ...entity, created: now, lastExamined: now };
        await updateReexamination(successfulReexamination);
        onResult();
      } else {
        setAlgorithmStage(nextStage);
        setIsButtonClicked(false);
      }
    }
  };

  if (!skill) {
    return <Spinner label={t('Loading')} />;
  }

  return (
    <div className={className} >
      {algorithmStage ? (<>
        <InstructionsContainer key={entity?.cid}>
          {algorithmStage.getWords()}

        </InstructionsContainer>
        <InstructionsButtonsContainer>
          <InstructionsButtonsGroup>
            {algorithmStage.getPrevious() && (
              <Button onClick={() => handleStageChange(algorithmStage.getPrevious())}
                icon='arrow-left'
                label={t('Back')}
                isDisabled={isButtonClicked}
              />
            )}
            {algorithmStage.getNext().map((nextStage, index) => (
              <Button key={index} onClick={() => handleStageChange(nextStage)}
                icon='square'
                label={nextStage.getName()}
                isDisabled={isButtonClicked}
              />
            ))}
          </InstructionsButtonsGroup>
        </InstructionsButtonsContainer>
      </>) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}

export default React.memo(DoInstructions)