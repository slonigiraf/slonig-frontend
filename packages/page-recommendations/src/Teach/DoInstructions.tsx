// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useCallback } from 'react';
import { AlgorithmStage, StageType } from './AlgorithmStage.js';
import { Button, Menu, Popup, Spinner, styled } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/slonig-components';
import { ValidatingAlgorithm } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';
import { ChatContainer, Bubble, useIpfsContext, useLog, OKBox, timeStampStringToNumber } from '@slonigiraf/slonig-components';
import { getLetterTemplate, getSetting, Lesson, LetterTemplate, putLetterTemplate, Reexamination, SettingKey, storeSetting, TutorAction, updateReexamination } from '@slonigiraf/db';
import { getIPFSDataFromContentID, parseJson, useInfo } from '@slonigiraf/slonig-components';
import { TutoringAlgorithm, TutoringAlgorithmType } from './TutoringAlgorithm.js';
import ChatSimulation from './ChatSimulation.js';
import { ErrorType } from '@polkadot/react-params';
import { EXAMPLE_SKILL_KNOWLEDGE_CID, EXAMPLE_SKILL_KNOWLEDGE_ID, MIN_USING_HINT_MS, ONE_SUBJECT_PERIOD_MS } from '@slonigiraf/utils';
import { LessonStat } from '../types.js';

interface Props {
  className?: string;
  lesson: Lesson;
  lessonStat: LessonStat;
  anythingToLearn?: boolean;
  entity: LetterTemplate | Reexamination;
  tooFastWarning: boolean;
  pageWasJustRefreshed: boolean;
  onResult: (updater: () => Promise<void>, action: TutorAction) => void;
  hasTutorCompletedTutorial: boolean | null | undefined;
  studentName: string;
  stake?: string;
  hasTuteeUsedSlonig: boolean;
  isSendingResultsEnabled: boolean | null | undefined;
  isBeforeTeaching?: boolean;
  resetTimer: () => void;
  isTutorial: boolean;
}

type AlgorithmType = '' | 'TEACH_ALGO' | 'REEXAMINE_ALGO';

const nonEssentialStageTypes = new Set([
  StageType.see_statistics,
  StageType.too_fast_warning,
  StageType.first_time_intro,
  StageType.encourage_penalization
]);

function isNonEssentialStageType(algorithmStage: AlgorithmStage) {
  return nonEssentialStageTypes.has(algorithmStage.getType());
}


function DoInstructions({ className = '', entity, lessonStat, anythingToLearn = true, resetTimer, tooFastWarning, pageWasJustRefreshed, lesson, onResult, studentName, stake = '', isSendingResultsEnabled, hasTuteeUsedSlonig, hasTutorCompletedTutorial, isTutorial }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [skill, setSkill] = useState<Skill>();
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();
  const { showInfo } = useInfo();
  const { logEvent } = useLog();
  const [lastPressingNextButtonTime, setLastPressingNextButtonTime] = useState((new Date()).getTime());
  const [algorithmType, setAlgorithmType] = useState<AlgorithmType>('');
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const [isChatFinished, setIsChatFinished] = useState(false);
  const [areButtonsBlured, setButtonsBlured] = useState(true);
  const [tooFastConfirmationIsShown, setTooFastConfirmationIsShown] = useState(false);
  const [processedStages, setProcessedStages] = useState(0);
  const [lastStageEndTime, setLastStageEndTime] = useState<number>(Date.now());

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

          const logStartEvent = async (action: string) => {
            const lastDiscussedId = await getSetting(SettingKey.LAST_SKILL_TUTORING_ID);
            const lastDiscussedStartTime = timeStampStringToNumber(await getSetting(SettingKey.LAST_SKILL_TUTORING_START_TIME));
            const timePassed = lastDiscussedStartTime ? (Date.now() - lastDiscussedStartTime) : Date.now();
            if (lastDiscussedId !== skill.i || timePassed > ONE_SUBJECT_PERIOD_MS) {
              logEvent('TUTORING', action, skill.h);
              await storeSetting(SettingKey.LAST_SKILL_TUTORING_ID, skill.i);
              await storeSetting(SettingKey.LAST_SKILL_TUTORING_START_TIME, Date.now().toString());
            }
          }

          if (isComponentMounted) {
            setSkill(skill);
            if (isLetterTemplate(entity)) {
              if (hasTutorCompletedTutorial || skill.i === EXAMPLE_SKILL_KNOWLEDGE_ID) {
                logStartEvent('TEACH_START');
              }
              setAlgorithmType('TEACH_ALGO');
            } else {
              logStartEvent('REEXAMINE_START');
              setAlgorithmType('REEXAMINE_ALGO');
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
  }, [ipfs, entity, hasTutorCompletedTutorial]);

  useEffect(() => {
    if (!skill) return;

    if (isLetterTemplate(entity)) {
      const skipStat = pageWasJustRefreshed || (lessonStat.askedForReexaminations === 0 && lessonStat.learnStep === 0);
      const variation: TutoringAlgorithmType = tooFastWarning ? 'with_too_fast_warning' :
        !hasTutorCompletedTutorial ? 'tutorial' :
          skipStat ? 'no_stat' : 'with_stat';

      const newAlgorithm = new TutoringAlgorithm(
        {
          t,
          studentName,
          stake,
          canIssueBadge: !!stake && !!hasTutorCompletedTutorial,
          skill,
          hasTuteeUsedSlonig,
          variation,
        });

      setAlgorithmStage(newAlgorithm.getBegin());
    } else {
      const newAlgorithm = new ValidatingAlgorithm(
        {
          t,
          studentName,
          stake,
          skill,
        });
      setAlgorithmStage(newAlgorithm.getBegin());
    }
  }, [tooFastWarning, skill, lesson, anythingToLearn, lessonStat, pageWasJustRefreshed, entity, studentName, stake, hasTuteeUsedSlonig, hasTutorCompletedTutorial]);

  const processLetter = useCallback(async (isValid?: boolean) => {
    if (!isLetterTemplate(entity)) return;
    const { template, matureInfo } = await getMatureInfo();

    if (!template) {
      onResult(async () => { }, undefined);
      return;
    }

    const valid = (template.cid === EXAMPLE_SKILL_KNOWLEDGE_CID) || (isValid ?? !template.toRepeat);
    const action: TutorAction = (valid ? `mark_mastered_${matureInfo}` : `mark_for_repeat_${matureInfo}`) as TutorAction;

    onResult(async () => {
      const timeSpent = Math.round((Date.now() - lastStageEndTime) / 1000);
      logEvent('TUTORING', 'TEACH_END', action, timeSpent);
      await putLetterTemplate({
        ...template,
        valid,
        toRepeat: !valid || !template.mature,
        lastExamined: Date.now(),
      });
    }, action);
  }, [entity, isLetterTemplate, getLetterTemplate, putLetterTemplate, onResult, logEvent, lastStageEndTime]);


  const markLetterAsNotPerfect = useCallback(async () => {
    if (isLetterTemplate(entity)) {
      const preparedLetterTemplate: LetterTemplate = {
        ...entity,
        valid: false,
        toRepeat: true,
      };
      await putLetterTemplate(preparedLetterTemplate);
    }
  }, [isLetterTemplate, entity, putLetterTemplate]);

  const getMatureInfo = useCallback(async () => {
    const template = await getLetterTemplate(entity.lesson, entity.stage);
    if (!template) {
      return { template: undefined, matureInfo: undefined };
    }
    const matureInfo = template.cid === EXAMPLE_SKILL_KNOWLEDGE_CID ? 'warm_up' : template.mature ? 'mature' : 'crude';
    return { template, matureInfo };
  }, []);

  const repeatTomorrow = useCallback(async () => {
    const timeSpent = Math.round((Date.now() - lastStageEndTime) / 1000);
    const { matureInfo } = await getMatureInfo();
    logEvent('TUTORING', 'TEACH_END', `click_instant_mark_for_repeat_${matureInfo}`, timeSpent);
    await processLetter(false);
  }, [processLetter, logEvent]);

  const issueDiploma = useCallback(async () => {
    const timeSpent = Math.round((Date.now() - lastStageEndTime) / 1000);
    const { matureInfo } = await getMatureInfo();
    logEvent('TUTORING', 'TEACH_ALGO', `click_instant_mark_mastered_${matureInfo}`, timeSpent);
    await processLetter(true);
  }, [processLetter, logEvent]);

  const studentPassedReexamination = useCallback(async () => {
    if (isReexamination(entity) && 'created' in entity) {
      onResult(async () => {
        const now = (new Date).getTime();
        const successfulReexamination: Reexamination = { ...entity, lastExamined: now };
        await updateReexamination(successfulReexamination);
      }, 'validate');
    }
  }, [isReexamination, entity, updateReexamination, onResult]);

  const studentFailedReexamination = useCallback(async () => {
    if (isReexamination(entity) && 'created' in entity) {
      onResult(async () => {
        const now = (new Date).getTime();
        const failedReexamination: Reexamination = { ...entity, lastExamined: now, valid: false };
        await updateReexamination(failedReexamination);
      }, 'revoke');
    }
  }, [isReexamination, entity, updateReexamination, onResult]);

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

  const refreshStageView = useCallback(() => {
    setProcessedStages(processedStages + 1)
    setButtonsBlured(true);
    setIsChatFinished(false);
  }, [setProcessedStages, processedStages, setButtonsBlured, setIsChatFinished])

  const hasStudenFailed = (stage: AlgorithmStage): boolean => {
    if (!hasTutorCompletedTutorial) return false;
    if (stage.getType() === StageType.correct_fake_solution ||
      stage.getType() === StageType.ask_to_repeat_similar_exercise
    ) {
      return true;
    }
    return false;
  }

  const onAllMessagesRevealed = useCallback(() => {
    setIsChatFinished(true);
    setLastPressingNextButtonTime((new Date()).getTime());
  }, [setIsChatFinished, setLastPressingNextButtonTime]);

  const processNext = useCallback(() => {
    const now = (new Date()).getTime();
    const timeSpent = now - lastPressingNextButtonTime;
    if (timeSpent < MIN_USING_HINT_MS) {
      logEvent('ONBOARDING', 'TOO_SHORT_USING_HINT_TIME', 'too_short_using_hint_time_sec', Math.round(timeSpent / 1000)
      );
      setTooFastConfirmationIsShown(true);
    } else {
      setLastPressingNextButtonTime(now);
      setButtonsBlured(false);
    }
  }, [lastPressingNextButtonTime, logEvent, setTooFastConfirmationIsShown, setButtonsBlured]);

  const handleStageChange = useCallback(async (nextStage: AlgorithmStage | null) => {
    if (nextStage !== null && algorithmStage) {
      if (isNonEssentialStageType(algorithmStage)) {
        resetTimer();
      }
      const timeSpent = Math.round((Date.now() - lastStageEndTime) / 1000);
      setIsButtonClicked(true);
      const logStageTime = (nextStageType?: StageType) => {
        logEvent('TUTORING', algorithmType, algorithmStage.getType(), timeSpent);
        if (nextStageType) {
          logEvent('TUTORING', algorithmType, nextStageType, timeSpent);
        }
      }
      if (hasStudenFailed(nextStage)) {
        await markLetterAsNotPerfect();
      }
      if (nextStage === algorithmStage) {
        showInfo(t('Do this again'));
        refreshStageView();
      }
      if (isReexamination(entity) && nextStage.getType() === StageType.reimburse) {
        logStageTime();
        studentFailedReexamination();
        refreshStageView();
      } else if (nextStage.getType() === StageType.skip) {
        preserveFromNoobs(() => {
          logStageTime(StageType.skip);
          refreshStageView();
          onResult(async () => { }, 'skip');
        }, () => setIsButtonClicked(false));
      } else if (isLetterTemplate(entity) && (nextStage.getType() === StageType.next_skill)) {
        logStageTime();
        await processLetter();
        refreshStageView();
      } else if (isLetterTemplate(entity) && (nextStage.getType() === StageType.repeat_tomorrow)) {
        logStageTime();
        await processLetter(false);
        refreshStageView();
      } else if (isReexamination(entity) && nextStage.getType() === StageType.success) {
        logStageTime();
        studentPassedReexamination();
        refreshStageView();
      } else {
        logStageTime();
        setAlgorithmStage(nextStage);
        refreshStageView();
        setIsButtonClicked(false);
      }
    }
    setLastStageEndTime(Date.now());
  }, [algorithmStage,
    entity,
    lastStageEndTime,
    t,
    showInfo,
    refreshStageView,
    studentFailedReexamination,
    studentPassedReexamination,
    preserveFromNoobs,
    processLetter,
    setAlgorithmStage,
    setIsButtonClicked,
    onResult]);

  if (!skill) {
    return <StyledSpinner label={t('Loading')} />;
  }

  const isDecisionStyleBlured = (algorithmStage && algorithmStage.getMessages().length > 0 &&
    hasTutorCompletedTutorial === false &&
    (areButtonsBlured || isSendingResultsEnabled === true)) || (hasTutorCompletedTutorial === true && isTutorial);

  const showChatDecorator = (hasTutorCompletedTutorial || isChatFinished) && (hasTutorCompletedTutorial && !isTutorial);

  return (
    <div className={className}>
      {algorithmStage ? (
        <InstructionsContainer key={entity?.cid}>
          <ChatSimulation
            key={algorithmStage.getId() + processedStages}
            messages={algorithmStage.getMessages()}
            hasTutorCompletedTutorial={hasTutorCompletedTutorial}
            isSendingResultsEnabled={isSendingResultsEnabled}
            isTutorial={isTutorial}
            onAllMessagesRevealed={onAllMessagesRevealed}
          />

          {showChatDecorator && algorithmStage.getChatDecorator()}

          <InstructionsButtonsContainer>
            <DecisionBubble $blur={isDecisionStyleBlured}>
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
                    onClick={() => {
                      logEvent('TUTORING', algorithmType, 'click_back');
                      handleStageChange(algorithmStage.getPrevious());
                    }
                    }
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
                {!isNonEssentialStageType(algorithmStage) &&
                  (
                    <StyledPopup
                      value={
                        <Menu>
                          {isReexamination(entity) ? (
                            <>
                              <Menu.Item
                                icon='thumbs-up'
                                key='studentPassedReexamination'
                                label={t('Tutee has the skill')}
                                onClick={() => {
                                  const timeSpent = Math.round((Date.now() - lastStageEndTime) / 1000);
                                  logEvent('TUTORING', 'REEXAMINE_ALGO', 'click_instant_validate', timeSpent);
                                  studentPassedReexamination();
                                }}
                              />
                              <Menu.Divider />
                              <Menu.Item
                                icon='circle-exclamation'
                                key='studentFailedReexamination'
                                label={t('Tutee failed the reexamination')}
                                onClick={() => {
                                  const timeSpent = Math.round((Date.now() - lastStageEndTime) / 1000);
                                  logEvent('TUTORING', 'REEXAMINE_ALGO', 'click_instant_revoke', timeSpent);
                                  studentFailedReexamination();
                                }}
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
                    onClick={processNext}
                  />
                </NextOverlay>
              )}
          </InstructionsButtonsContainer>
          {tooFastConfirmationIsShown && (
            <OKBox info={t('Please teach more slowly and follow all the hints carefully.')} onClose={() => setTooFastConfirmationIsShown(false)} />
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