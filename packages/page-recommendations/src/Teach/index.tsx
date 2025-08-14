// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { Button, LinearProgress, styled } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import { FullFindow, VerticalCenterItemsContainer, useLoginContext } from '@slonigiraf/app-slonig-components';
import { LetterTemplate, Lesson, Reexamination, getPseudonym, getLesson, getLetterTemplatesByLessonId, getReexaminationsByLessonId, getSetting, storeSetting, updateLesson, getLetter, getReexamination, SettingKey, deleteSetting } from '@slonigiraf/db';
import DoInstructions from './DoInstructions.js';
import LessonsList from './LessonsList.js';
import LessonResults from './LessonResults.js';
import LessonRequestReceiver from './LessonRequestReceiver.js';

interface Props {
  className?: string;
}

function Teach({ className = '' }: Props): React.ReactElement<Props> {
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
  const [studentUsedSlonig, setStudentUsedSlonig] = useState(false);


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
        setResultsShown(lessonResultsAreShown? true : false);
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
    storeSetting(SettingKey.LESSON, lesson.id);
    storeSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN, 'true');
    setLesson(lesson);
    setResultsShown(true);
  }, [storeSetting, setLesson, setResultsShown]);

  const onLessonUpdate = useCallback((
    updatedLesson: Lesson,
    currentletterTemplates: LetterTemplate[],
    currentReexaminations: Reexamination[]) => {
    async function run() {
      if (updatedLesson) {
        setStudentUsedSlonig(currentReexaminations?.length > 0 || updatedLesson.learnStep > 0);
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
    setReexaminationToPerform, onShowResults]);

  const onCloseTutoring = useCallback(async () => {
    await deleteSetting(SettingKey.LESSON);
    setLesson(null);
  }, [deleteSetting, setLesson]);

  const onCloseResults = useCallback(async () => {
    onCloseTutoring();
    await deleteSetting(SettingKey.LESSON_RESULTS_ARE_SHOWN);
    setResultsShown(false);
  }, [setResultsShown, onCloseTutoring]);

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";

  const reexamAndDiplomaIssuing = <FullFindow>
    <VerticalCenterItemsContainer>
      {lesson && <Progress>
        <Spacer/>
        <LinearProgress total={lesson.toLearnCount + lesson.toReexamineCount} value={lesson.learnStep + lesson.reexamineStep} />
        <CloseButton onClick={onCloseTutoring} icon='close' />
        <Spacer/>
        </Progress>}
      
      <Bubbles>
      {!reexamined && reexaminationToPerform && <DoInstructions entity={reexaminationToPerform} onResult={updateReexamined} studentName={studentName} key={'reexaminine' + reexaminationToPerform.cid} />}
      {reexamined && letterTemplateToIssue && <DoInstructions entity={letterTemplateToIssue} onResult={updateLearned} studentName={studentName} studentUsedSlonig={studentUsedSlonig} key={'learn' + letterTemplateToIssue.cid} />}
      </Bubbles>
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
            <> {areResultsShown ? <LessonResults lesson={lesson} updateAndStoreLesson={updateAndStoreLesson} onClose={onCloseResults} /> : reexamAndDiplomaIssuing}</>
          }
        </>
      }
    </div>
  );
}

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