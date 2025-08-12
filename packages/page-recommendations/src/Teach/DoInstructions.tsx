// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useCallback } from 'react';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button, Menu, Popup, Spinner, styled } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { ValidatingAlgorithm } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';
import { ChatContainer, InstructionsButtonsContainer, InstructionsButtonsGroup, InstructionsContainer, useIpfsContext } from '@slonigiraf/app-slonig-components';
import { LetterTemplate, putLetterTemplate, Reexamination, updateReexamination } from '@slonigiraf/db';
import { getIPFSDataFromContentID, parseJson, useInfo } from '@slonigiraf/app-slonig-components';
import { TutoringAlgorithm } from './TutoringAlgorithm.js';
import ChatSimulation from './ChatSimulation.js';
import { ErrorType } from '@polkadot/react-params';

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
          if ((e as Error).message === ErrorType.IPFS_CONNECTION_ERROR) {
            showInfo(t('No internet connection. Check your connection and try again.'), 'error');
          }
          console.log('ipfs err: ', e);
        }
      }
    }

    fetchData();

    return () => {
      isComponentMounted = false;
    };
  }, [ipfs, entity, studentName]);

  const processLetter = useCallback(async (success: boolean) => {
    if (isLetterTemplate(entity)) {
      const preparedLetterTemplate: LetterTemplate = {
        ...entity,
        valid: success,
        lastExamined: (new Date()).getTime(),
      };
      await putLetterTemplate(preparedLetterTemplate);
      onResult();
    }
  }, [isLetterTemplate, entity, putLetterTemplate, onResult]);

  const repeatTomorrow = useCallback(async () => {
    processLetter(false);
  }, [processLetter]);

  const issueDiploma = useCallback(async () => {
    processLetter(true);
  }, [processLetter]);

  const studentPassedReexamination = useCallback(async () => {
    if (isReexamination(entity) && 'created' in entity) {
      const now = (new Date).getTime();
      const successfulReexamination: Reexamination = { ...entity, lastExamined: now };
      await updateReexamination(successfulReexamination);
      onResult();
    }
  }, [isReexamination, entity, updateReexamination, onResult]);

  const studentFailedReexamination = useCallback(async () => {
    if (isReexamination(entity) && 'created' in entity) {
      const now = (new Date).getTime();
      showInfo(t('Bounty will be collected after the lesson ends.'));
      const failedReexamination: Reexamination = { ...entity, lastExamined: now, valid: false };
      await updateReexamination(failedReexamination);
      onResult();
    }
  }, [showInfo, t, entity, updateReexamination, onResult]);

  const handleStageChange = async (nextStage: AlgorithmStage | null) => {
    if (nextStage !== null) {
      setIsButtonClicked(true);
      if (nextStage === algorithmStage) {
        showInfo(t('Do this again'));
      }
      if (isReexamination(entity) && nextStage.type === 'reimburse') {
        studentFailedReexamination();
      } else if (nextStage.type === 'skip') {
        onResult();
      } else if (isLetterTemplate(entity) && (nextStage.type === 'success' || nextStage.type === 'next_skill')) {
        processLetter(nextStage.type === 'success');
      } else if (isReexamination(entity) && nextStage.type === 'success') {
        studentPassedReexamination();
      } else {
        setAlgorithmStage(nextStage);
        setIsButtonClicked(false);
      }
    }
  };

  if (!skill) {
    return <StyledSpinner label={t('Loading')} />;
  }

  return (
    <div className={className} >
      {algorithmStage ? (<>
        <InstructionsContainer key={entity?.cid}>
          <ChatSimulation messages={algorithmStage.getMessages()} />
          {algorithmStage.getChatDecorator()}
        </InstructionsContainer>
        <InstructionsButtonsContainer>
          {algorithmStage.getActionHint() && (
            <><h2>{t('⚖️ Decide on the next step')}</h2>
              <ChatContainer>{algorithmStage.getActionHint()}</ChatContainer>
            </>
          )}
          <InstructionsButtonsGroup>
            {algorithmStage.getPrevious() && (
              <Button key={algorithmStage.getId()} onClick={() => handleStageChange(algorithmStage.getPrevious())}
                icon='arrow-left'
                label={t('Back')}
                isDisabled={isButtonClicked}
              />
            )}
            {algorithmStage.getNext().map((nextStage, index) => (
              <Button key={index + algorithmStage.getId()} onClick={() => handleStageChange(nextStage)}
                icon='square'
                label={nextStage.getName()}
                isDisabled={isButtonClicked}
              />
            ))}
            {!algorithmStage.getPrevious() &&
              <StyledPopup
                value={
                  <Menu>
                    {isReexamination(entity) ?
                      <React.Fragment>
                        <Menu.Item
                          icon='thumbs-up'
                          key='studentPassedReexamination'
                          label={t('Student has the skill')}
                          onClick={studentPassedReexamination}
                        />
                        <Menu.Divider />
                        <Menu.Item
                          icon='circle-exclamation'
                          key='studentFailedReexamination'
                          label={t('Student failed the reexamination')}
                          onClick={studentFailedReexamination}
                        />
                      </React.Fragment>
                      :
                      <React.Fragment>
                        <Menu.Item
                          icon='thumbs-up'
                          key='issueDiploma'
                          label={t('Student mastered the skill')}
                          onClick={issueDiploma}
                        />
                        <Menu.Divider />
                        <Menu.Item
                          icon='circle-exclamation'
                          key='repeatTomorrow'
                          label={t('Should be repeated tomorrow')}
                          onClick={repeatTomorrow}
                        />
                      </React.Fragment>
                    }
                  </Menu>
                }
              />}

          </InstructionsButtonsGroup>
        </InstructionsButtonsContainer>
      </>) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}
const StyledPopup = styled(Popup)`
  .ui--Icon {
    background-color: transparent !important;
    color: #F39200 !important;
  }
`;

const StyledSpinner = styled(Spinner)`
  margin: 20px;
`;

export default React.memo(DoInstructions)