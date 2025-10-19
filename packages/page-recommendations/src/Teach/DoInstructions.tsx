// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useCallback } from 'react';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button, Menu, Popup, Spinner, styled } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { ValidatingAlgorithm } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';
import { ChatContainer, Bubble, useIpfsContext, Confirmation } from '@slonigiraf/app-slonig-components';
import { LetterTemplate, putLetterTemplate, Reexamination, updateReexamination } from '@slonigiraf/db';
import { getIPFSDataFromContentID, parseJson, useInfo } from '@slonigiraf/app-slonig-components';
import { TutoringAlgorithm } from './TutoringAlgorithm.js';
import ChatSimulation from './ChatSimulation.js';
import { ErrorType } from '@polkadot/react-params';

interface Props {
  className?: string;
  entity: LetterTemplate | Reexamination;
  onResult: () => void;
  hasTutorCompletedTutorial: boolean | undefined;
  studentName: string | null;
  bothUsedSlonig?: boolean;
  isSendingResultsEnabled: boolean | undefined;
}

function DoInstructions({ className = '', entity, onResult, studentName, bothUsedSlonig = true, isSendingResultsEnabled, hasTutorCompletedTutorial }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [skill, setSkill] = useState<Skill>();
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();
  const { showInfo } = useInfo();
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const [isChatFinished, setIsChatFinished] = useState(false);
  const [areButtonsBlured, setButtonsBlured] = useState(true);
  const [tutorConfirmedTalking, setTutorConfirmedTalking] = useState(false);
  const [isTalkingConfirmOpen, setTalkingConfirmOpen] = useState(false);

  const [processedStages, setProcessedStages] = useState(0);

  const isLetterTemplate = useCallback((entity: LetterTemplate | Reexamination) => {
    return 'knowledgeId' in entity;
  }, []);

  const isReexamination = useCallback((entity: LetterTemplate | Reexamination) => {
    return !isLetterTemplate(entity);
  }, []);

  const revealActionButtons = useCallback(() => {
    if (areButtonsBlured && !tutorConfirmedTalking) {
      setTalkingConfirmOpen(true);
    } else {
      setButtonsBlured(false);
    }
  }, [areButtonsBlured, tutorConfirmedTalking, setTalkingConfirmOpen, setButtonsBlured]);

  useEffect(() => {
    if (!areButtonsBlured && !tutorConfirmedTalking && !isChatFinished) {
      setTalkingConfirmOpen(true);
    }
  }, [areButtonsBlured, tutorConfirmedTalking, isChatFinished, setTalkingConfirmOpen]);

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
              const newAlgorithm = new TutoringAlgorithm(t, studentName, skill, bothUsedSlonig);
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

  const preserveFromNoobs = useCallback(
    (run: () => void, fallback?: () => void) => {
      if (hasTutorCompletedTutorial) {
        run();
      } else {
        showInfo(
          t('After completing the training, you’ll be able to press it. Now try another button.')
        );
        fallback?.();
      }
    },
    [hasTutorCompletedTutorial, showInfo, t]
  );

  const tutorPressedConfirmation = useCallback(() => {
    setTalkingConfirmOpen(false);
    setTutorConfirmedTalking(true);
    setButtonsBlured(false);
  }, [setTalkingConfirmOpen, setTutorConfirmedTalking, setButtonsBlured])

  const handleStageChange = async (nextStage: AlgorithmStage | null) => {
    setProcessedStages(processedStages + 1)
    setButtonsBlured(true);
    setIsChatFinished(false);
    setTutorConfirmedTalking(false);
    if (nextStage !== null) {
      setIsButtonClicked(true);
      if (nextStage === algorithmStage) {
        showInfo(t('Do this again'));
      }
      if (isReexamination(entity) && nextStage.type === 'reimburse') {
        studentFailedReexamination();
      } else if (nextStage.type === 'skip') {
        preserveFromNoobs(onResult, () => setIsButtonClicked(false));
      } else if (isLetterTemplate(entity) && (nextStage.type === 'success' || nextStage.type === 'next_skill')) {
        processLetter(nextStage.type === 'success');
      } else if (isReexamination(entity) && nextStage.type === 'success') {
        studentPassedReexamination();
      } else if (nextStage.type === 'repeat') {
        preserveFromNoobs(() => setAlgorithmStage(nextStage), () => setIsButtonClicked(false));
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
    <div className={className}>
      {algorithmStage ? (
        <InstructionsContainer key={entity?.cid}>
          <ChatSimulation
            key={algorithmStage.getId() + processedStages}
            messages={algorithmStage.getMessages()}
            hasTutorCompletedTutorial={hasTutorCompletedTutorial}
            isSendingResultsEnabled={isSendingResultsEnabled}
            onAllMessagesRevealed={() => setIsChatFinished(true)}
          />

          {algorithmStage.getChatDecorator()}

          <InstructionsButtonsContainer>
            <DecisionBubble $blur={hasTutorCompletedTutorial === false && (areButtonsBlured || isSendingResultsEnabled === true)}>
              <ChatContainer>
                <h2>{t('⚖️ Decide on the next step')}</h2>
                <span>
                  {algorithmStage.getActionHint() && algorithmStage.getActionHint()}
                </span>
              </ChatContainer>

              <InstructionsButtonsGroup>
                {algorithmStage.getPrevious() && (
                  <Button
                    className='noHighlight'
                    key={algorithmStage.getId()}
                    onClick={() => handleStageChange(algorithmStage.getPrevious())}
                    icon='arrow-left'
                    label={t('Back')}
                    isDisabled={isButtonClicked}
                  />
                )}
                {algorithmStage.getNext().map((nextStage, index) => (
                  <Button
                    className='noHighlight'
                    key={index + algorithmStage.getId()}
                    onClick={() => handleStageChange(nextStage)}
                    icon='square'
                    label={nextStage.getName()}
                    isDisabled={isButtonClicked}
                  />
                ))}
                {!algorithmStage.getPrevious() && (
                  <StyledPopup
                    value={
                      <Menu>
                        {isReexamination(entity) ? (
                          <>
                            <Menu.Item
                              icon='thumbs-up'
                              key='studentPassedReexamination'
                              label={t('Tutee has the skill')}
                              onClick={studentPassedReexamination}
                            />
                            <Menu.Divider />
                            <Menu.Item
                              icon='circle-exclamation'
                              key='studentFailedReexamination'
                              label={t('Tutee failed the reexamination')}
                              onClick={studentFailedReexamination}
                            />
                          </>
                        ) : (
                          <>
                            <Menu.Item
                              icon='thumbs-up'
                              key='issueDiploma'
                              label={t('Tutee mastered the skill')}
                              onClick={() => preserveFromNoobs(issueDiploma)}
                            />
                            <Menu.Divider />
                            <Menu.Item
                              icon='circle-exclamation'
                              key='repeatTomorrow'
                              label={t('Should be repeated tomorrow')}
                              onClick={() => preserveFromNoobs(repeatTomorrow)}
                            />
                          </>
                        )}
                      </Menu>
                    }
                  />
                )}
              </InstructionsButtonsGroup>

            </DecisionBubble>
            {hasTutorCompletedTutorial === false &&
              isChatFinished && areButtonsBlured && (
                <NextOverlay>
                  <Button
                    className='highlighted--button'
                    icon="eye"
                    label={t('Next')}
                    onClick={revealActionButtons}
                  />
                </NextOverlay>
              )}
          </InstructionsButtonsContainer>
          {isTalkingConfirmOpen && (
            <Confirmation
              question={t('🗣 means “say it out loud.” Did you say what was written in the instruction?')}
              onClose={() => setTalkingConfirmOpen(false)}
              onConfirm={tutorPressedConfirmation}
            />
          )}
        </InstructionsContainer>
      ) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}
const NextOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  button {
    pointer-events: all;
  }
`;

const DecisionBubble = styled(Bubble) <{ $blur: boolean }>`
  transition: filter 0.3s ease, opacity 0.3s ease;
  filter: ${({ $blur }) => ($blur ? 'blur(3px) brightness(0.7)' : 'none')};
  opacity: ${({ $blur }) => ($blur ? 0.5 : 1)};
  pointer-events: ${({ $blur }) => ($blur ? 'none' : 'auto')};
`;
const StyledPopup = styled(Popup)`
  .ui--Icon {
    background-color: transparent !important;
    color: #F39200 !important;
  }
`;

const StyledSpinner = styled(Spinner)`
  margin: 20px;
`;

const InstructionsContainer = styled.div`
  padding: 15px 3px 3px 3px;
  width: 100%;
  justify-content: center;
`;

const InstructionsButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0px 10px 0px 10px;
  .hint {
    text-align: center;
    padding-bottom: 10px;
  }
  box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.13);
  width: 100%;
  margin: 0;
  word-wrap: break-word;
  position: relative;
  text-align: center;
`;
export const InstructionsButtonsGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0 auto;
  margin-top: 5px;
  min-width: 300px;
  max-width: 300px;
  & > button {
    height: 2.5rem !important;
    padding: 10px !important;
  }
`;
export default React.memo(DoInstructions)