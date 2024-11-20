// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { styled, Progress } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import { getIPFSDataFromContentID, parseJson, useIpfsContext, useLoginContext, LoginButton, StyledContentCloseButton, Skill } from '@slonigiraf/app-slonig-components';
import { LetterTemplate, Lesson, Reexamination, getPseudonym, getLesson, getLetterTemplatesByLessonId, getReexaminationsByLessonId, deleteSetting, getSetting, storeSetting, updateLesson, putLetter, getLetter, getReexamination, SettingKey, putLetterTemplate, getLetterTemplate } from '@slonigiraf/db';
import Reexamine from './Reexamine.js';
import { TutoringAlgorithm } from './TutoringAlgorithm.js';
import DoInstructions from './DoInstructions.js';
import { useTranslation } from '../translate.js';
import LessonsList from './LessonsList.js';
import LessonResults from './LessonResults.js';
import LessonRequestReceiver from './LessonRequestReceiver.js';

interface Props {
  className?: string;
}

interface LetterTemplateId {
  lesson: string;
  cid: string;
}

function Tutor({ className = '' }: Props): React.ReactElement<Props> {
  // Initialize api, ipfs and translation
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { t } = useTranslation();
  const { currentPair, isLoggedIn } = useLoginContext();

  const [reexaminationToPerform, setReexaminationToPerform] = useState<Reexamination | null>(null);
  const [letterTemplateToIssue, setLetterTemplateToIssue] = useState<LetterTemplate | null>(null);

  // Store progress state
  const [reexamined, setReexamined] = useState<boolean>(false);
  const [tutoringAlgorithm, setTutoringAlgorithm] = useState<TutoringAlgorithm | null>(null);

  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  //   show stake and days or hide
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [letterTemplates, setLetterTemplates] = useState<LetterTemplate[]>([]);
  const [reexaminations, setReexaminations] = useState<Reexamination[]>([]);
  const [areResultsShown, setResultsShown] = useState(false);


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

  useEffect(() => {
    async function fetchLesson() {
      const lessonId = await getSetting(SettingKey.LESSON);
      if (lessonId) {
        const fetchedLesson = await getLesson(lessonId);
        setLesson(fetchedLesson || null);
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
    }
    fetchLesson();
  }, [])

  // Fetch skill data and set teaching algorithm
  useEffect(() => {
    async function fetchData() {
      if (isIpfsReady && letterTemplateToIssue) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, letterTemplateToIssue.cid);
          const skill: Skill = parseJson(skillContent);
          const studentUsedSlonig = reexaminations?.length > 0 || lesson?.learnStep;
          setTutoringAlgorithm(new TutoringAlgorithm(letterTemplateToIssue.cid, t, studentName ? studentName : null, skill, !studentUsedSlonig));
        }
        catch (e) {
          console.log(e);
        }
      }
    }
    fetchData();
  }, [ipfs, isIpfsReady, letterTemplateToIssue, studentName,
    getIPFSDataFromContentID, parseJson, setTutoringAlgorithm, lesson?.learnStep])

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

  const updateTutoring = useCallback(
    async (stage: string) => {
      if (letterTemplateToIssue) {
        if (stage === 'success' || stage === 'next_skill') {
          const preparedLetterTemplate: LetterTemplate = {
            ...letterTemplateToIssue,
            valid: stage === 'success',
            lastExamined: (new Date()).getTime(),
          };
          await putLetterTemplate(preparedLetterTemplate);
          updateLearned();
        } else if (stage === 'skip') {
          updateLearned();
        }
      }
    },
    [updateLearned, letterTemplateToIssue, putLetter]
  );

  const onResumeTutoring = useCallback((lesson: Lesson): void => {
    storeSetting(SettingKey.LESSON, lesson.id);
    setLesson(lesson);
  }, [storeSetting, setLesson]);

  const onShowResults = useCallback(async (lesson: Lesson) => {
    storeSetting(SettingKey.LESSON, lesson.id);
    setLesson(lesson);
    setResultsShown(true);
  }, [storeSetting, setLesson, setResultsShown]);

  const onLessonUpdate = useCallback((
    updatedLesson: Lesson,
    currentletterTemplates: LetterTemplate[],
    currentReexaminations: Reexamination[]) => {
    async function run() {
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

  const onCloseResults = useCallback(() => {
    setResultsShown(false);
    onCloseTutoring();
  }, [setResultsShown, onCloseTutoring]);

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const lessonReactKey = lesson ? (lesson.learnStep + lesson.reexamineStep) : 'loading';

  const skillIsLoaded = tutoringAlgorithm?.id === letterTemplateToIssue?.cid;

  const reexamAndDiplomaIssuing = <>
    {lesson && <StyledProgress
      value={lesson.learnStep + lesson.reexamineStep}
      total={lesson.toLearnCount + lesson.toReexamineCount}
    />}
    <StyledContentCloseButton onClick={onCloseTutoring}
      icon='close'
    />
    <div style={!reexamined ? {} : { display: 'none' }}>
      {currentPair && <Reexamine reexamination={reexaminationToPerform} onResult={updateReexamined} studentName={studentName} key={'reexaminine' + lessonReactKey} />}
    </div>
    <div style={reexamined ? {} : { display: 'none' }}>
      {tutoringAlgorithm && skillIsLoaded && <DoInstructions algorithm={tutoringAlgorithm} onResult={updateTutoring} key={'learn' + lessonReactKey} />}
    </div>
  </>;

  return (
    <div className={`toolbox--Tutor ${className}`}>
      {
        isLoggedIn &&
        <>
          <LessonRequestReceiver setCurrentLesson={setLesson} />
          {lesson == null ? <LessonsList tutor={publicKeyHex} onResumeTutoring={onResumeTutoring} onShowResults={onShowResults} />
            :
            <> {areResultsShown ? <LessonResults lesson={lesson} updateAndStoreLesson={updateAndStoreLesson} onClose={onCloseResults} /> : reexamAndDiplomaIssuing}</>
          }
        </>
      }
      <LoginButton />
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

export default React.memo(Tutor);

