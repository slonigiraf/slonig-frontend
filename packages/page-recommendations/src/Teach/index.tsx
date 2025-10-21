// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { Button, LinearProgress, styled } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import { Confirmation, OKBox, FullFindow, VerticalCenterItemsContainer, useInfo, useLoginContext, HintBubble, useBooleanSettingValue } from '@slonigiraf/app-slonig-components';
import { LetterTemplate, Lesson, Reexamination, getPseudonym, getLesson, getLetterTemplatesByLessonId, getReexaminationsByLessonId, getSetting, storeSetting, updateLesson, getLetter, getReexamination, SettingKey, deleteSetting, getValidLetterTemplatesByLessonId, isThereAnyLessonResult, setSettingToTrue } from '@slonigiraf/db';
import DoInstructions from './DoInstructions.js';
import LessonsList from './LessonsList.js';
import LessonResults from './LessonResults.js';
import LessonRequestReceiver from './LessonRequestReceiver.js';
import { useTranslation } from '../translate.js';
import { useLocation } from 'react-router-dom';

interface Props {
  className?: string;
}

function Teach({ className = '' }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const showHelpQRInfo = queryParams.get('showHelpQRInfo') != null;

  const { t } = useTranslation();
  const { showInfo } = useInfo();
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
  const isViralMessageOpen = useBooleanSettingValue(SettingKey.VIRAL_TUTORIAL_COMPLETED) === false && hasTutorCompletedTutorial;
  const [bothUsedSlonig, setBothUsedSlonig] = useState(false);
  const [isSendingResultsEnabled, setIsSendingResultsEnabled] = useState<boolean | undefined>(undefined);
  const [isGreetingOpen, setIsGreetingOpen] = useState(hasTutorCompletedTutorial === false);
  const [isHelpQRInfoShown, setIsHelpQRInfoShown] = useState(showHelpQRInfo);


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
  }, [])

  // Fetch days valid

  const updateReexamined = useCallback(async () => {
    if (lesson) {
      const nextStep = lesson.reexamineStep + 1;
      if (nextStep <= lesson.toReexamineCount) {
        const updatedLesson = { ...lesson, reexamineStep: nextStep };
        updateAndStoreLesson(updatedLesson);
      }
    }
  }, [lesson, updateAndStoreLesson]);

  const updateLearned = useCallback(async (): Promise<void> => {
    if (lesson && lesson.toLearnCount > lesson.learnStep) {
      const updatedLesson = { ...lesson, learnStep: lesson.learnStep + 1 };
      updateAndStoreLesson(updatedLesson);
    }
  }, [lesson, updateAndStoreLesson]);

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
        const bothUsed = hasTutorCompletedTutorial && currentReexaminations?.length > 0 || updatedLesson.learnStep > 0;
        setBothUsedSlonig(bothUsed);
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
        setResultsShown(true);
      }
    }
    run();
  }, [setReexamined, getLetter, setLetterTemplateToIssue, getReexamination,
    setReexaminationToPerform, onShowResults, hasTutorCompletedTutorial]);

  const onCloseTutoring = useCallback(async () => {
    await deleteSetting(SettingKey.LESSON);
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
    setIsGreetingOpen(false);
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
            hasTutorCompletedTutorial={hasTutorCompletedTutorial}
            onResult={updateReexamined}
            studentName={studentName}
            isSendingResultsEnabled={isSendingResultsEnabled}
            isBeforeTeaching={letterTemplates && letterTemplates.length > 0}
            key={'reexaminine' + reexaminationToPerform.cid} />}
        {reexamined && letterTemplateToIssue &&
          <DoInstructions
            entity={letterTemplateToIssue}
            hasTutorCompletedTutorial={hasTutorCompletedTutorial}
            onResult={updateLearned}
            studentName={studentName}
            bothUsedSlonig={bothUsedSlonig}
            isSendingResultsEnabled={isSendingResultsEnabled}
            key={'learn' + letterTemplateToIssue.cid} />}
        {lesson &&
          <SendResults $blur={isSendingResultsEnabled !== true}>
            {hasTutorCompletedTutorial === false && isSendingResultsEnabled === true &&
              <HintBubble>
                <h2>{t('Press this button to send the results and get your reward for tutoring')}</h2>
              </HintBubble>
            }
            <Button
              isDisabled={!isSendingResultsEnabled}
              icon={'paper-plane'}
              label={t('Send results and get a reward')}
              onClick={() => onShowResults(lesson)} />
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
          {lesson !== null && isGreetingOpen && (
            <OKBox info={t('This app will help you teach your tutee. Let’s start by teaching just one skill.')} onClose={() => setIsGreetingOpen(false)} />
          )}
          {lesson === null && isViralMessageOpen && (
            <OKBox info={t('Congratulations! Now help your other friends become tutors — pretend to be their tutee.')} onClose={() => setSettingToTrue(SettingKey.VIRAL_TUTORIAL_COMPLETED)} />
          )}
          {isHelpQRInfoShown && (
            <OKBox info={t('Tell the tutee to scan the same QR code.')} onClose={() => setIsHelpQRInfoShown(false)} />
          )}
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