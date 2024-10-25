// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from 'react';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button, Progress, Spinner } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { ValidatingAlgorithm } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';
import { InstructionsButtonsContainer, InstructionsButtonsGroup, InstructionsContainer, StyledCloseButton, useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Insurance } from '../db/Insurance.js';
import { getIPFSDataFromContentID, parseJson, useInfo } from '@slonigiraf/app-slonig-components';
import type { KeyringPair } from '@polkadot/keyring/types';
import { useApi } from '@polkadot/react-hooks';
import { getBounty } from "../getBounty.js";
import { styled } from '@polkadot/react-components';
import { updateInsurance } from '../utils.js';
import { Lesson } from '../db/Lesson.js';

interface Props {
  className?: string;
  currentPair: KeyringPair;
  lesson: Lesson | null;
  insurance: Insurance | null;
  onResult: () => void;
  studentName: string | null;
  onClose: () => void;
}

function Reexamine({ className = '', currentPair, lesson, insurance, onResult, studentName, onClose }: Props): React.ReactElement<Props> {
  const { api } = useApi();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [skill, setSkill] = useState<Skill>();
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();
  const { showInfo } = useInfo();
  const [isButtonClicked, setIsButtonClicked] = useState(false);


  useEffect(() => {
    let isComponentMounted = true;

    async function fetchData() {
      if (isIpfsReady && insurance && insurance.cid) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, insurance.cid, 1);
          const skillJson = parseJson(skillContent);

          if (isComponentMounted) {
            setSkill(skillJson);
            const newAlgorithm = new ValidatingAlgorithm(t, studentName, skillJson, insurance);
            setAlgorithmStage(newAlgorithm.getBegin());
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
  }, [ipfs, insurance]);

  const handleStageChange = async (nextStage: AlgorithmStage | null) => {
    if (nextStage !== null) {
      setIsButtonClicked(true);
      if (nextStage.type === 'reimburse' && insurance != null) {
        getBounty(insurance, currentPair, api, t, onResult, showInfo);
      } else if (nextStage.type === 'skip' && insurance != null) {
        const skippedInsurance: Insurance = { ...insurance, wasSkipped: true };
        await updateInsurance(skippedInsurance);
        onResult();
      } else if (nextStage.type === 'success') {
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
    <div className={className}>
      {algorithmStage ? (
        <InstructionsContainer>
          {lesson && <StyledProgress
            value={lesson.learnStep + lesson.reexamineStep}
            total={lesson.toLearnCount + lesson.toReexamineCount}
          />}
          <StyledCloseButton onClick={onClose}
            icon='close'
          />
          {algorithmStage.getWords()}
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
        </InstructionsContainer>
      ) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}

const StyledProgress = styled(Progress)`
  position: fixed;
  bottom: 80px;
  left: 20px;
  z-index: 1;
  @media (min-width: 768px) {
    left: 50%;
    transform: translateX(-50%) translateX(-350px);
  }
`;

export default React.memo(Reexamine)