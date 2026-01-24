// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, LinearProgress, styled } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import { Confirmation, OKBox, FullFindow, VerticalCenterItemsContainer, useInfo, useLoginContext, HintBubble, useBooleanSettingValue, useLog, useNumberSettingValue } from '@slonigiraf/slonig-components';
import { LetterTemplate, Lesson, Reexamination, getPseudonym, getLesson, getLetterTemplatesByLessonId, getReexaminationsByLessonId, getSetting, storeSetting, updateLesson, getLetter, getReexamination, SettingKey, deleteSetting, isThereAnyLessonResult, setSettingToTrue } from '@slonigiraf/db';
import DoInstructions from './DoInstructions.js';
import LessonsList from './LessonsList.js';
import LessonResults from './LessonResults.js';
import LessonRequestReceiver from './LessonRequestReceiver.js';
import { useTranslation } from '../translate.js';
import { useLocation } from 'react-router-dom';
import { EXAMPLE_MODULE_KNOWLEDGE_CID, FAST_SKILL_DISCUSSION_MS, MAX_FAST_DISCUSSED_SKILLS_IN_ROW_COUNT, MAX_SAME_PARTNER_TIME_MS, MIN_SAME_PARTNER_TIME_MS, MIN_SKILL_DISCUSSION_MS } from '@slonigiraf/utils';

interface Props {
  className?: string;
}

function Teach({ className = '' }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const showHelpQRInfo = queryParams.get('showHelpQRInfo') != null;

  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const { logEvent } = useLog();
  // Initialize api, ipfs and translation
  const { currentPair, isLoggedIn } = useLoginContext();
  const [reexaminationToPerform, setReexaminationToPerform] = useState<Reexamination | null>(null);
  const [letterTemplateToIssue, setLetterTemplateToIssue] = useState<LetterTemplate | null>(null);

  // Store progress state
  const [reexamined, setReexamined] = useState<boolean>(false);

  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  //   show stake and days or hide
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [letterTemplates, setLetterTemplates] = useState<LetterTemplate[]>([]);
  const [reexaminations, setReexaminations] = useState<Reexamination[]>([]);
  const [areResultsShown, setResultsShown] = useState(false);
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const hasTutorCompletedTutorial = useBooleanSettingValue(SettingKey.TUTOR_TUTORIAL_COMPLETED);
  const lastPartnerChangeTime = useNumberSettingValue(SettingKey.LAST_PARTNER_CHANGE_TIME);
  const [hasTuteeUsedSlonig, setHasTuteeUsedSlonig] = useState(false);
  const [isSendingResultsEnabled, setIsSendingResultsEnabled] = useState<boolean | undefined>(undefined);
  const [isHelpQRInfoShown, setIsHelpQRInfoShown] = useState(showHelpQRInfo);
  const [lastSkillDiscussedTime, setLastSkillDiscussedTime] = useState<number | null>(null);
  const [tooFastConfirmationIsShown, setTooFastConfirmationIsShown] = useState(false);
  const [fastDiscussedSkillsCount, setFastDiscussedSkillsCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);
  const [isPairChangeDialogueOpen, setIsPairChangeDialogueOpen] = useState(false);
  const lastTimeBucketRef = useRef<number | null>(null);

  useEffect(() => {
    if (!lastSkillDiscussedTime && (letterTemplateToIssue !== null || reexaminationToPerform !== null)) {
      setLastSkillDiscussedTime((new Date()).getTime());
    }
  }, [lastSkillDiscussedTime, letterTemplateToIssue, reexaminationToPerform]);

  useEffect(() => {
    if (!lesson || isPairChangeDialogueOpen) return;

    const tick = () => {
      const now = Date.now();
      const justStartedToWork = lastPartnerChangeTime && (now - lastPartnerChangeTime) < MIN_SAME_PARTNER_TIME_MS;
      const bucket = Math.floor(now / MAX_SAME_PARTNER_TIME_MS);
      if (!justStartedToWork && bucket !== lastTimeBucketRef.current) {
        setIsPairChangeDialogueOpen(true);
      }
      lastTimeBucketRef.current = bucket;
    };

    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [lesson, lastPartnerChangeTime, isPairChangeDialogueOpen, setIsPairChangeDialogueOpen]);

  const protectTutor = useCallback(async (isLearning: boolean, action: () => Promise<void>) => {
    if (!lastSkillDiscussedTime) return;

    const now = (new Date()).getTime();
    const timeSpent = now - lastSkillDiscussedTime;

    if (!hasTutorCompletedTutorial) {
      logEvent('ONBOARDING', 'TUTOR_TUTORIAL_TIME', 'tutor_tutorial_time_sec', Math.round(timeSpent / 1000));
      await action();
      return;
    }

    setLastSkillDiscussedTime(now);

    const logTime = (isLearning: boolean, timeSpent: number) => {
      logEvent('TUTORING',
        isLearning ? 'TOO_SHORT_TEACH' : 'TOO_SHORT_REEXAMINE',
        isLearning ? 'too_short_teach_time_sec' : 'too_short_reexamine_time_sec',
        Math.round(timeSpent / 1000)
      );
    }

    if (timeSpent < MIN_SKILL_DISCUSSION_MS) {
      logTime(isLearning, timeSpent);
      setTooFastConfirmationIsShown(true);
    } else if (timeSpent < FAST_SKILL_DISCUSSION_MS) {
      if (fastDiscussedSkillsCount + 1 > MAX_FAST_DISCUSSED_SKILLS_IN_ROW_COUNT) {
        logEvent('TUTORING', 'SEVERAL_FAST_DISCUSSIONS_IN_ROW');
        setTooFastConfirmationIsShown(true);
        setFastDiscussedSkillsCount(0);
      } else {
        setFastDiscussedSkillsCount(fastDiscussedSkillsCount + 1);
        logTime(isLearning, timeSpent);
        await action();
      }
    } else {
      setFastDiscussedSkillsCount(0);
      logTime(isLearning, timeSpent);
      await action();
    }

  }, [hasTutorCompletedTutorial, fastDiscussedSkillsCount, lastSkillDiscussedTime, setTooFastConfirmationIsShown]);

  useEffect(() => {
    const checkResults = async () => {
      if (lesson) {
        setIsSendingResultsEnabled(await isThereAnyLessonResult(lesson?.id));
      }
    }
    checkResults();
  }, [lesson])

  // Helper functions
  const updateAndStoreLesson = useCallback(
    async (updatedLesson: Lesson | null) => {
      if (updatedLesson) {
        await updateLesson(updatedLesson);
        setLesson(updatedLesson);
        onLessonUpdate(updatedLesson, letterTemplates, reexaminations);
      }
    },
    [letterTemplates, reexaminations, setLesson, updateLesson]
  );

  const fetchLesson = useCallback(
    async function fetchLesson() {
      const lessonId = await getSetting(SettingKey.LESSON);
      const lessonResultsAreShown = await getSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN);
      if (lessonId) {
        const fetchedLesson = await getLesson(lessonId);
        setLesson(fetchedLesson || null);
        setResultsShown(lessonResultsAreShown ? true : false);
        if (fetchedLesson) {
          const fetchedLetterTemplates = await getLetterTemplatesByLessonId(lessonId);
          if (fetchedLetterTemplates) {
            setLetterTemplates(fetchedLetterTemplates);
          }
          const fetchedReexaminations = await getReexaminationsByLessonId(lessonId);
          if (fetchedReexaminations) {
            setReexaminations(fetchedReexaminations);
          }
          const pseudonym = fetchedLesson ? await getPseudonym(fetchedLesson.student) : null;
          if (pseudonym) {
            setStudentName(pseudonym);
          }
          onLessonUpdate(fetchedLesson, fetchedLetterTemplates, fetchedReexaminations);
        }
      } else {
        setLesson(null);
      }
    },
    []
  );

  useEffect(() => {
    fetchLesson();
  }, []);

  const updateReexamined = useCallback(async () => {
    if (lesson) {
      const nextStep = lesson.reexamineStep + 1;
      if (nextStep <= lesson.toReexamineCount) {
        const updatedLesson = { ...lesson, reexamineStep: nextStep };
        await protectTutor(false, () => updateAndStoreLesson(updatedLesson));
      }
    }
  }, [lesson, updateAndStoreLesson, protectTutor]);

  const updateLearned = useCallback(async (): Promise<void> => {
    if (lesson && lesson.toLearnCount > lesson.learnStep) {
      const updatedLesson = { ...lesson, learnStep: lesson.learnStep + 1 };
      await protectTutor(true, () => updateAndStoreLesson(updatedLesson));
    }
  }, [lesson, updateAndStoreLesson, protectTutor]);

  const onResumeTutoring = useCallback(async (lesson: Lesson): Promise<void> => {
    await storeSetting(SettingKey.LESSON, lesson.id);
    fetchLesson();
  }, [storeSetting, setLesson]);

  const onShowResults = useCallback(async (lesson: Lesson) => {
    await Promise.all([
      storeSetting(SettingKey.LESSON, lesson.id),
      storeSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN, 'true'),
    ]);
    setLesson(lesson);
    setResultsShown(true);
  }, [storeSetting, setLesson, setResultsShown]);

  const onLessonUpdate = useCallback((
    updatedLesson: Lesson,
    currentletterTemplates: LetterTemplate[],
    currentReexaminations: Reexamination[]) => {
    async function run() {
      if (updatedLesson) {
        setHasTuteeUsedSlonig(currentReexaminations?.length > 0 || updatedLesson.learnStep > 0);
      }
      if (updatedLesson.reexamineStep < updatedLesson.toReexamineCount) {
        setReexamined(false);
      } else {
        setReexamined(true);
      }
      if (updatedLesson.learnStep < currentletterTemplates.length) {
        setLetterTemplateToIssue(currentletterTemplates[updatedLesson.learnStep]);
      }
      if (updatedLesson.reexamineStep < currentReexaminations.length) {
        setReexaminationToPerform(currentReexaminations[updatedLesson.reexamineStep]);
      }
      if (updatedLesson.learnStep === updatedLesson.toLearnCount && updatedLesson.reexamineStep === updatedLesson.toReexamineCount) {
        logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_auto_send_opened');
        onShowResults(updatedLesson);
      }
    }
    run();
  }, [setReexamined, getLetter, setLetterTemplateToIssue, getReexamination,
    setReexaminationToPerform, onShowResults, hasTutorCompletedTutorial]);

  const onCloseTutoring = useCallback(async () => {
    await deleteSetting(SettingKey.LESSON);
    setLastSkillDiscussedTime(null);
    setFastDiscussedSkillsCount(0);
    setTooFastConfirmationIsShown(false);
    setLesson(null);
    setIsExitConfirmOpen(false);
    setReexaminationToPerform(null);
    setLetterTemplateToIssue(null);
    setReexamined(false);
    setStudentName(null);
    setLetterTemplates([]);
    setReexaminations([]);
    setResultsShown(false);
    setIsSendingResultsEnabled(undefined);
  }, [deleteSetting, setLesson]);

  const onCloseResults = useCallback(async () => {
    onCloseTutoring();
    await deleteSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN);
    setResultsShown(false);
  }, [deleteSetting, getSetting, hasTutorCompletedTutorial, setResultsShown, onCloseTutoring]);

  const tryToCloseResults = useCallback((): void => {
    hasTutorCompletedTutorial ? onCloseResults() : setIsExitConfirmOpen(true);
  }, [hasTutorCompletedTutorial, onCloseResults, setIsExitConfirmOpen]);

  const tryToCloseTutoring = useCallback((): void => {
    hasTutorCompletedTutorial ? onCloseTutoring() : setIsExitConfirmOpen(true);
  }, [hasTutorCompletedTutorial, onCloseTutoring, setIsExitConfirmOpen]);

  const tutorUnderstoodWarning = useCallback(() => {
    setWarningCount(warningCount + 1);
    setTooFastConfirmationIsShown(false);
  }, [warningCount, setWarningCount, setTooFastConfirmationIsShown]);

  const onChangePartnerConfirm = useCallback(() => {
    if (!lesson) return;
    setIsPairChangeDialogueOpen(false);
    logEvent('CLASSROOM', 'AGREE_PARTNER_CHANGE');
    if (isSendingResultsEnabled) {
      logEvent('TUTORING', 'LESSON_RESULTS', 'click_agree_to_send_results');
      onShowResults(lesson);
    } else {
      onCloseResults();
    }
  }, [setIsPairChangeDialogueOpen, logEvent, isSendingResultsEnabled, onShowResults, onCloseResults, lesson]);

  const onChangePartnerPostpone = useCallback(async () => {
    setIsPairChangeDialogueOpen(false);
    logEvent('CLASSROOM', 'POSTPONE_PARTNER_CHANGE');
    const now = (new Date()).getTime();
    await storeSetting(SettingKey.LAST_PARTNER_CHANGE_TIME, now.toString());
  }, [setIsPairChangeDialogueOpen, logEvent, storeSetting]);

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";

  // Don't do reexaminations if the tutor is a first time tutor
  useEffect((): void => {
    if (lesson != null) {
      if (hasTutorCompletedTutorial === false && !reexamined && reexaminationToPerform) {
        if (letterTemplateToIssue) {
          updateReexamined();
        } else {
          onCloseTutoring();
          showInfo(t('You should practice tutoring first before you can reexamine.'));
        }
      }
    }
  }, [lesson, hasTutorCompletedTutorial, reexamined, reexaminationToPerform, letterTemplateToIssue, updateReexamined]);

  const clock = <ClockDiv>🕑</ClockDiv>;

  const isTutorial = lesson?.cid === EXAMPLE_MODULE_KNOWLEDGE_CID;
  const reexamAndDiplomaIssuing = <FullFindow>
    <VerticalCenterItemsContainer>
      {lesson && <Progress>
        <Spacer />
        <LinearProgress total={lesson.toLearnCount + lesson.toReexamineCount} value={lesson.learnStep + lesson.reexamineStep} />
        <CloseButton onClick={tryToCloseTutoring} icon='close' />
        <Spacer />
      </Progress>}

      {isSendingResultsEnabled !== undefined && <Bubbles>
        {!reexamined && reexaminationToPerform &&
          <DoInstructions
            entity={reexaminationToPerform}
            hasTuteeUsedSlonig={hasTuteeUsedSlonig}
            hasTutorCompletedTutorial={hasTutorCompletedTutorial}
            onResult={updateReexamined}
            studentName={studentName}
            isTutorial={isTutorial}
            isSendingResultsEnabled={isSendingResultsEnabled}
            isBeforeTeaching={letterTemplates && letterTemplates.length > 0}
            key={'reexaminine' + warningCount + reexaminationToPerform.cid} />}
        {reexamined && letterTemplateToIssue &&
          <DoInstructions
            entity={letterTemplateToIssue}
            hasTuteeUsedSlonig={hasTuteeUsedSlonig}
            hasTutorCompletedTutorial={hasTutorCompletedTutorial}
            onResult={updateLearned}
            studentName={studentName}
            isTutorial={isTutorial}
            isSendingResultsEnabled={isSendingResultsEnabled}
            key={'learn' + warningCount + letterTemplateToIssue.cid} />}
        {lesson &&
          <SendResults $blur={isSendingResultsEnabled !== true}>
            {(hasTutorCompletedTutorial === false || isTutorial) && isSendingResultsEnabled === true &&
              <HintBubble>
                <h2>{t('Press this button to send the results and get your reward for tutoring')}</h2>
              </HintBubble>
            }
            <Button
              isDisabled={!isSendingResultsEnabled}
              icon={'paper-plane'}
              label={t('Send results and get a reward')}
              onClick={() => {
                logEvent('TUTORING', 'LESSON_RESULTS', 'click_send_during_lesson');
                onShowResults(lesson);
              }
              } />
          </SendResults>
        }
      </Bubbles>}
    </VerticalCenterItemsContainer>
  </FullFindow>;

  return (
    <div className={`toolbox--Tutor ${className}`}>
      {
        isLoggedIn &&
        <>
          <LessonRequestReceiver setCurrentLesson={fetchLesson} />
          {lesson == null ? <LessonsList tutor={publicKeyHex} onResumeTutoring={onResumeTutoring} onShowResults={onShowResults} />
            :
            <> {areResultsShown ? <LessonResults lesson={lesson} updateAndStoreLesson={updateAndStoreLesson} onClose={tryToCloseResults} onFinished={onCloseResults} /> : reexamAndDiplomaIssuing}</>
          }
          {isExitConfirmOpen && (
            <Confirmation question={t('Sure to exit tutoring?')} onClose={() => setIsExitConfirmOpen(false)} onConfirm={onCloseResults} />
          )}
          {isHelpQRInfoShown && (
            <OKBox info={t('Tell the tutee to scan the same QR code.')} onClose={() => setIsHelpQRInfoShown(false)} />
          )}
          {tooFastConfirmationIsShown && (
            <OKBox info={t('Please teach more slowly and follow all the hints carefully.')} onClose={tutorUnderstoodWarning} />
          )}
          {
            lesson && isPairChangeDialogueOpen && <Confirmation
              decorator={clock}
              question={t('It’s time to send the results and become a student of a new partner.')}
              agreeText={t('OK')}
              disagreeText={t('Postpone')}
              onClose={onChangePartnerPostpone}
              onConfirm={onChangePartnerConfirm}
            />
          }
        </>
      }
    </div>
  );
}

const SendResults = styled.div<{ $blur: boolean }>`
  position: relative; /* 🧭 important for absolute positioning of HintBubble */
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-top: 10px;

    transition: filter 0.3s ease, opacity 0.3s ease;
  filter: ${({ $blur }) => ($blur ? 'blur(3px) brightness(0.7)' : 'none')};
  opacity: ${({ $blur }) => ($blur ? 0.5 : 1)};
  pointer-events: ${({ $blur }) => ($blur ? 'none' : 'auto')};
`;

const Spacer = styled.div`
  width: 20px;
`;
const ClockDiv = styled.div`
  margin: 5px;  
  width: 100%;
  font-size: 4em;
  text-align: center;
`;
const Progress = styled.div`
  margin-top: 20px;
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
`;
const Bubbles = styled.div`
  text-align: center;
  width: 100%;
`;
export const CloseButton = styled(Button)`
  position: relative;
  right: 0px;
  margin-left: 10px;
`;

export default React.memo(Teach);