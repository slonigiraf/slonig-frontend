// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useCallback } from 'react';
import { AlgorithmStage, StageType } from './AlgorithmStage.js';
import { Button, Menu, Popup, Spinner, styled } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/slonig-components';
import { ValidatingAlgorithm, ValidatingAlgorithmType } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';
import { ChatContainer, Bubble, useIpfsContext, useLog, OKBox, stringToNumber, useNumberSettingValue } from '@slonigiraf/slonig-components';
import { getLetterTemplate, getSetting, Lesson, LetterTemplate, putLetterTemplate, Reexamination, SettingKey, storeSetting, TutorAction, updateReexamination } from '@slonigiraf/db';
import { getIPFSDataFromContentID, parseJson, useInfo } from '@slonigiraf/slonig-components';
import { TutoringAlgorithm, TutoringAlgorithmType } from './TutoringAlgorithm.js';
import ChatSimulation from './ChatSimulation.js';
import { ErrorType } from '@polkadot/react-params';
import { EXAMPLE_SKILL_KNOWLEDGE_CID, MAX_COUNT_WITHOUT_CORRECT_FAKE_IN_RAW, MIN_USING_HINT_MS, ONE_SUBJECT_PERIOD_MS } from '@slonigiraf/utils';
import { LessonStat } from '../types.js';
import { useToggle } from '@polkadot/react-hooks';

export type EventActionType = 'TEACH' | 'REEXAMINE' | 'WARM_UP' | 'RE_WARM_UP';
interface Props {
  className?: string;
  eventCategory: EventActionType;
  lesson: Lesson;
  lessonStat: LessonStat;
  anythingToLearn?: boolean;
  entity: LetterTemplate | Reexamination;
  tooFastWarning: boolean;
  pageWasJustRefreshed: boolean;
  onResult: (lessonDuration: number, updater: () => Promise<void>, action: TutorAction) => void;
  hasTutorCompletedTutorial: boolean | null | undefined;
  studentName: string;
  stake?: string;
  hasTuteeUsedSlonig: boolean;
  isSendingResultsEnabled: boolean | null | undefined;
  isBeforeTeaching?: boolean;
  isTutorial: boolean;
}



const nonEssentialStageTypes = new Set([
  StageType.decide_about_badge,
  StageType.repeat_tomorrow,
  StageType.skip,
  StageType.first_time_intro,
  StageType.next_skill,
  StageType.validate,
  StageType.revoke,
  StageType.success,
  StageType.reimburse,
  StageType.ask_to_close_notes,
]);

function isTalkStageType(algorithmStage: AlgorithmStage) {
  return !nonEssentialStageTypes.has(algorithmStage.getType());
}

function talkingDurationOrZero(duration: number, algorithmStage: AlgorithmStage | undefined) {
  return (algorithmStage && isTalkStageType(algorithmStage)) ? duration : 0;
}

function DoInstructions({ className = '', entity, eventCategory, lessonStat, anythingToLearn = true, tooFastWarning, pageWasJustRefreshed, lesson, onResult, studentName, stake = '', isSendingResultsEnabled, hasTuteeUsedSlonig, hasTutorCompletedTutorial, isTutorial }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [skill, setSkill] = useState<Skill>();
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();
  const { showInfo } = useInfo();
  const { logEvent, logBan } = useLog();
  const countOfMissedCorrectFakeSolution = useNumberSettingValue(SettingKey.COUNT_WITHOUT_CORRECT_FAKE_IN_RAW);
  const [lastPressingNextButtonTime, setLastPressingNextButtonTime] = useState((new Date()).getTime());
  const algorithmType = `${eventCategory}_ALGO`;
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const [isChatFinished, setIsChatFinished] = useState(false);
  const [areButtonsBlured, setButtonsBlured] = useState(true);
  const [isOkBoxOpen, toggleIsOkBoxOpen] = useToggle();
  const [okBoxInfo, setOkboxInfo] = useState('');
  const [processedStages, setProcessedStages] = useState(0);
  const [lastStageEndTime, setLastStageEndTime] = useState<number>(Date.now());
  const [previousTeachingStagesDuration, setPreviousTeachingStagesDuration] = useState(0);
  const [didCorrectFakeSolution, setDidCorrectFakeSolution] = useState(false);
  const [didCorrectExercise, setDidCorrectExercise] = useState(false);

  const showOkBoxInfo = useCallback((info: string) => {
    setOkboxInfo(info);
    toggleIsOkBoxOpen();
  }, [setOkboxInfo, toggleIsOkBoxOpen])

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
            const lastDiscussedStartTime = stringToNumber(await getSetting(SettingKey.LAST_SKILL_TUTORING_START_TIME));
            const timePassed = lastDiscussedStartTime ? (Date.now() - lastDiscussedStartTime) : Date.now();
            if (lastDiscussedId !== skill.i || timePassed > ONE_SUBJECT_PERIOD_MS) {
              logEvent('TUTORING', action, skill.h);
              await storeSetting(SettingKey.LAST_SKILL_TUTORING_ID, skill.i);
              await storeSetting(SettingKey.LAST_SKILL_TUTORING_START_TIME, Date.now().toString());
            }
          }

          if (isComponentMounted) {
            setSkill(skill);
            logStartEvent(`${eventCategory}_START`);
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
  }, [ipfs, entity, lessonStat, hasTutorCompletedTutorial]);

  useEffect(() => {
    if (!skill) return;
    const skipCloseNotesWarning = lessonStat.reexamineStep > 0 || lessonStat.learnStep > 0;

    if (isLetterTemplate(entity)) {

      const variation: TutoringAlgorithmType =
        (!hasTutorCompletedTutorial && lessonStat.askedToLearn === 1) ? 'redo_tutorial' :
          (!hasTutorCompletedTutorial && lessonStat.learnStep === 0) ? 'tutorial' :
            skipCloseNotesWarning ? 'regular' : 'first_in_lesson';

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
      const variation: ValidatingAlgorithmType = skipCloseNotesWarning ? 'regular' : 'first_in_lesson';

      const newAlgorithm = new ValidatingAlgorithm(
        {
          t,
          studentName,
          stake,
          skill,
          variation,
        });
      setAlgorithmStage(newAlgorithm.getBegin());
    }
  }, [tooFastWarning, skill, lesson, anythingToLearn, lessonStat, pageWasJustRefreshed, entity, studentName, stake, hasTuteeUsedSlonig, hasTutorCompletedTutorial]);

  const processLetter = useCallback(async (isValid: boolean, isInstantDecision?: boolean) => {
    if (!isLetterTemplate(entity)) return;
    const { template, matureInfo } = await getMatureInfo();

    if (!template) {
      onResult(0, async () => { }, undefined);
      return;
    }

    if (!isInstantDecision) {
      if (didCorrectFakeSolution) {
        await storeSetting(SettingKey.COUNT_WITHOUT_CORRECT_FAKE_IN_RAW, '0');
      } else if (!entity.mature) {
        const previousValue = countOfMissedCorrectFakeSolution || 0;
        const newValue = previousValue + 1;
        await storeSetting(SettingKey.COUNT_WITHOUT_CORRECT_FAKE_IN_RAW, newValue.toString());
        if (newValue > MAX_COUNT_WITHOUT_CORRECT_FAKE_IN_RAW) {
          logBan('too_many_without_correct_fake_in_raw');
        }
      }
    }

    const valid = (template.cid === EXAMPLE_SKILL_KNOWLEDGE_CID) || (isValid ?? !template.toRepeat);

    const action: TutorAction = (valid ? `mark_mastered_${matureInfo}` : `mark_for_repeat_${matureInfo}`) as TutorAction;

    const lastStageTimeSpent = Date.now() - lastStageEndTime;
    const talkingDuration = previousTeachingStagesDuration + talkingDurationOrZero(lastStageTimeSpent, algorithmStage);

    onResult(talkingDuration, async () => {
      logEvent('TUTORING', algorithmType, action, Math.round(lastStageTimeSpent / 1000));
      await putLetterTemplate({
        ...template,
        valid,
        toRepeat: !valid || !template.mature,
        lastExamined: Date.now(),
      });
    }, action);
  }, [entity, countOfMissedCorrectFakeSolution, algorithmStage, isLetterTemplate, getLetterTemplate, putLetterTemplate, onResult, logEvent, lastStageEndTime, previousTeachingStagesDuration]);


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
    logEvent('TUTORING', algorithmType, `click_instant_mark_for_repeat_${matureInfo}`, timeSpent);
    await processLetter(false, true);
  }, [processLetter, logEvent]);

  const issueDiploma = useCallback(async () => {
    const timeSpent = Math.round((Date.now() - lastStageEndTime) / 1000);
    const { matureInfo } = await getMatureInfo();
    logEvent('TUTORING', algorithmType, `click_instant_mark_mastered_${matureInfo}`, timeSpent);
    await processLetter(true, true);
  }, [processLetter, logEvent]);

  const finishReexamination = useCallback(
    async (opts: { valid: boolean; action: 'validate' | 'revoke' }) => {
      if (!isReexamination(entity) || !('created' in entity)) return;

      const talkingDuration = previousTeachingStagesDuration + talkingDurationOrZero(Date.now() - lastStageEndTime, algorithmStage);

      onResult(
        talkingDuration,
        async () => {
          const now = Date.now();
          const updated: Reexamination = {
            ...entity,
            lastExamined: now,
            ...(opts.valid ? {} : { valid: false })
          };
          await updateReexamination(updated);
        },
        opts.action
      );
    },
    [
      isReexamination,
      entity,
      lastStageEndTime,
      previousTeachingStagesDuration,
      algorithmStage,
      onResult,
      updateReexamination
    ]
  );

  const studentPassedReexamination = useCallback(
    () => finishReexamination({ valid: true, action: 'validate' }),
    [finishReexamination]
  );

  const studentFailedReexamination = useCallback(
    () => finishReexamination({ valid: false, action: 'revoke' }),
    [finishReexamination]
  );


  const preserveFromNoobs = useCallback(
    async (run: () => Promise<void>, fallback: () => Promise<void>, actionType: string, info: string = t('After completing the training, you’ll be able to press it. Now try another button')) => {
      if (hasTutorCompletedTutorial) {
        await run();
      } else {
        showOkBoxInfo(info);
        logEvent('TUTORING', algorithmType, 'preserve_' + actionType);
        await fallback();
      }
    },
    [hasTutorCompletedTutorial, showOkBoxInfo, t]
  );

  const refreshStageView = useCallback(() => {
    setProcessedStages(processedStages + 1)
    setButtonsBlured(true);
    setIsChatFinished(false);
  }, [setProcessedStages, processedStages, setButtonsBlured, setIsChatFinished])

  const hasStudenFailed = (stage: AlgorithmStage, nextStage: AlgorithmStage): boolean => {
    if (!hasTutorCompletedTutorial) {
      return false;
    } else if (nextStage.getType() === StageType.ask_to_repeat_similar_exercise) {
      return true;
    } else if (stage.getType() === StageType.correct_fake_solution
      && nextStage.getType() !== StageType.provide_fake_solution) {
      return true;
    } else {
      return false;
    }
  }

  const onAllMessagesRevealed = useCallback(() => {
    setIsChatFinished(true);
    setLastPressingNextButtonTime((new Date()).getTime());
  }, [setIsChatFinished, setLastPressingNextButtonTime]);

  const processNext = useCallback(() => {
    const now = (new Date()).getTime();
    const timeSpent = now - lastPressingNextButtonTime;
    if (timeSpent < MIN_USING_HINT_MS) {
      logEvent('TUTORING', 'TOO_SHORT_USING_HINT');
      showOkBoxInfo(t('Please teach more slowly and follow all the hints carefully'));
    } else {
      setLastPressingNextButtonTime(now);
      setButtonsBlured(false);
    }
  }, [lastPressingNextButtonTime, logEvent, showOkBoxInfo, setButtonsBlured]);

  const reminderForTutorialStudent = t('Remind the student to pretend they don’t know the skill');

  const handleStageChange = useCallback(async (nextStage: AlgorithmStage | null, logAction?: () => void) => {
    if (nextStage !== null && algorithmStage) {

      const msSpent = Date.now() - lastStageEndTime;
      setIsButtonClicked(true);
      const logStageTime = (nextStageType?: StageType) => {
        logEvent('TUTORING', algorithmType, algorithmStage.getType(), Math.round(msSpent / 1000));
        if (isTalkStageType(algorithmStage)) {
          setPreviousTeachingStagesDuration(previousTeachingStagesDuration + msSpent);
        }
        if (nextStageType) {
          logEvent('TUTORING', algorithmType, nextStageType, Math.round(msSpent / 1000));
        }

        if (logAction) logAction();
      }
      if (hasStudenFailed(algorithmStage, nextStage)) {
        await markLetterAsNotPerfect();
      }
      if (nextStage.getType() === StageType.ask_to_repeat_similar_exercise) {
        setDidCorrectExercise(true);
        if (!didCorrectExercise) {
          logEvent('TUTORING', algorithmType, 'did_correct_exercise', Math.round(msSpent / 1000));
        }
      }
      if (algorithmStage.getType() === StageType.correct_fake_solution
        && nextStage.getType() !== StageType.provide_fake_solution) {
        setDidCorrectFakeSolution(true);
        if (!didCorrectFakeSolution) {
          logEvent('TUTORING', algorithmType, 'did_correct_fake_solution', Math.round(msSpent / 1000));
        }
      }
      if (nextStage === algorithmStage) {
        showInfo(t('Do this again'));
        refreshStageView();
      }

      const { template } = await getMatureInfo();

      if (template && template.toRepeat && nextStage.getType() === StageType.decide_about_badge) {
        logStageTime();
        await processLetter(false);
        refreshStageView();
      } else if (isReexamination(entity) && nextStage.getType() === StageType.reimburse) {
        logStageTime();
        studentFailedReexamination();
        refreshStageView();
      } else if (nextStage.getType() === StageType.skip) {
        preserveFromNoobs(async () => {
          logStageTime(StageType.skip);
          refreshStageView();
          onResult(0, async () => { }, 'skip');
        }, async () => setIsButtonClicked(false), 'skip');
      } else if (nextStage.getType() === StageType.ask_to_create_similar_exercise) { // don't allow student at training solve the first exercise
        preserveFromNoobs(async () => {
          // Only for the case we will change algo. As of 20260207, this code will never run:
          logStageTime();
          setAlgorithmStage(nextStage);
          setIsButtonClicked(false);
          refreshStageView();
        }, async () => setIsButtonClicked(false), 'solve_exercise', reminderForTutorialStudent);
      } else if (isLetterTemplate(entity)
        && algorithmStage.getType() === StageType.provide_fake_solution
        && (nextStage.getType() === StageType.next_skill)) { // don't allow tutor at training to escape correcting fake solution
        const action = async () => {
          logStageTime();
          await processLetter(false);
          refreshStageView();
        };
        if (didCorrectFakeSolution) {
          await action();
        } else {
          await preserveFromNoobs(action, async () => setIsButtonClicked(false), 'correct_fake', reminderForTutorialStudent);
        }
      } else if (nextStage.getType() === StageType.provide_fake_solution) { // don't allow student at training to create similar exercise from the first trial
        const action = async () => {
          logStageTime();
          setAlgorithmStage(nextStage);
          refreshStageView();
          setIsButtonClicked(false);
        };
        if (didCorrectExercise) {
          await action();
        } else {
          await preserveFromNoobs(action, async () => setIsButtonClicked(false), 'create_similar_exercise', t('Remind the student to pretend they don’t know the skill and can’t come up with a similar exercise on the first try'));
        }
      } else if (isLetterTemplate(entity) && (nextStage.getType() === StageType.repeat_tomorrow)) {
        logStageTime();
        await processLetter(false);
        refreshStageView();
      } else if (isLetterTemplate(entity)
        && (algorithmStage.getType() === StageType.decide_about_badge)
        && (nextStage.getType() === StageType.next_skill)) {
        logStageTime();
        await processLetter(true);
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
    didCorrectFakeSolution,
    didCorrectExercise,
    lastStageEndTime,
    previousTeachingStagesDuration,
    t,
    showInfo,
    setDidCorrectFakeSolution,
    refreshStageView,
    studentFailedReexamination,
    studentPassedReexamination,
    preserveFromNoobs,
    processLetter,
    setAlgorithmStage,
    setIsButtonClicked,
    setPreviousTeachingStagesDuration,
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
                      handleStageChange(algorithmStage.getPrevious(), () => logEvent('TUTORING', algorithmType, 'click_back'));
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
                {isTalkStageType(algorithmStage) &&
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
                                  logEvent('TUTORING', algorithmType, 'click_instant_validate', timeSpent);
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
                                  logEvent('TUTORING', algorithmType, 'click_instant_revoke', timeSpent);
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
                                onClick={() => preserveFromNoobs(issueDiploma, async () => { }, 'fast_mark_mastered')}
                              />
                              <Menu.Divider />
                              <Menu.Item
                                icon='circle-exclamation'
                                key='repeatTomorrow'
                                label={t('Should be repeated tomorrow')}
                                onClick={() => preserveFromNoobs(repeatTomorrow, async () => { }, 'instant_mark_repeat')}
                              />
                            </>
                          )}
                        </Menu>
                      }
                    />
                  )}
              </InstructionsButtonsGroup>

              <InstructionsButtonsGroup>
                {hasTutorCompletedTutorial
                  && algorithmStage.getType() === StageType.provide_fake_solution
                  && <Button
                    className='noHighlight'
                    key={algorithmStage.getId() + 'unsure'}
                    onClick={() => {
                      logEvent('TUTORING', algorithmType, 'click_unsure');
                      showOkBoxInfo(t('Try pressing the “No” button to see the example answers'));
                    }}
                    icon='circle-question'
                    label={t('I’m not sure myself')}
                    isDisabled={isButtonClicked}
                  />
                }
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
          {isOkBoxOpen && <OKBox info={okBoxInfo} onClose={toggleIsOkBoxOpen} />}
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