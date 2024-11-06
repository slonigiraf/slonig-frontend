// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { styled, Button, Progress } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, getBaseUrl, getIPFSDataFromContentID, parseJson, useIpfsContext, nameFromKeyringPair, useLoginContext, LoginButton, CenterQRContainer } from '@slonigiraf/app-slonig-components';
import { Letter, Lesson, Insurance, getPseudonym, getLesson, getLettersByLessonId, getInsurancesByLessonId, deleteSetting, getSetting, storeSetting, updateLesson, putLetter, getLetter, getInsurance, QRAction, SettingKey } from '@slonigiraf/db';
import Reexamine from './Reexamine.js';
import { TeachingAlgorithm } from './TeachingAlgorithm.js';
import DoInstructions from './DoInstructions.js';
import { useTranslation } from '../translate.js';
import LessonsList from './LessonsList.js';
import LessonResults from './LessonResults.js';
import LessonRequestReceiver from './LessonRequestReceiver.js';

interface Props {
  className?: string;
}

function Tutor({ className = '' }: Props): React.ReactElement<Props> {
  // Initialize api, ipfs and translation
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { t } = useTranslation();
  const { currentPair, isLoggedIn } = useLoginContext();

  const [insuranceToReexamine, setInsuranceToReexamine] = useState<Insurance | null>(null);
  const [letterToIssue, setLetterToIssue] = useState<Letter | null>(null);

  // Store progress state
  const [reexamined, setReexamined] = useState<boolean>(false);
  const [teachingAlgorithm, setTeachingAlgorithm] = useState<TeachingAlgorithm | null>(null);

  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  //   show stake and days or hide
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [letterIds, setLetterIds] = useState<number[]>([]);
  const [insuranceIds, setInsuranceIds] = useState<number[]>([]);
  const [areResultsShown, setResultsShown] = useState(false);

  // Helper functions
  const updateAndStoreLesson = useCallback(
    async (updatedLesson: Lesson | null) => {
      if (updatedLesson) {
        await updateLesson(updatedLesson);
      }
      setLesson(updatedLesson);
    },
    [setLesson, updateLesson]
  );

  // Fetch required info from DB about current lesson, letters to issue and insurances to reexamine
  useEffect(() => {
    async function fetchLesson() {
      const lessonId = await getSetting(SettingKey.LESSON);
      if (lessonId) {
        const fetchedLesson = await getLesson(lessonId);
        setLesson(fetchedLesson || null);
      } else {
        setLesson(null);
      }
    }
    fetchLesson();
  }, [getSetting, getLesson, setLesson])

  useEffect(() => {
    if (lesson?.id) {
      const fetchLetterIds = async () => {
        const fetchedLetters = await getLettersByLessonId(lesson.id);
        if (fetchedLetters) {
          const ids = fetchedLetters.map(letter => letter.id).filter(id => id !== undefined);
          setLetterIds(ids);
        }
      };
      fetchLetterIds();
    }
  }, [lesson?.id, getLettersByLessonId, setLetterIds]);

  useEffect(() => {
    if (lesson?.id) {
      const fetchInsuranceIds = async () => {
        const fetchedInsurances = await getInsurancesByLessonId(lesson?.id);
        if (fetchedInsurances) {
          const ids = fetchedInsurances.map(insurance => insurance.id).filter(id => id !== undefined);
          setInsuranceIds(ids);
        }
      };
      fetchInsuranceIds();
    }
  }, [lesson?.id, getInsurancesByLessonId, setInsuranceIds]);

  // Fetch skill data and set teaching algorithm
  useEffect(() => {
    async function fetchData() {
      if (isIpfsReady && letterToIssue) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, letterToIssue.cid);
          const skillJson = parseJson(skillContent);
          const studentUsedSlonig = insuranceIds?.length > 0;
          const name = studentName ? studentName : null;
          setTeachingAlgorithm(new TeachingAlgorithm(t, name, skillJson, !studentUsedSlonig));
        }
        catch (e) {
          console.log(e);
        }
      }
    }
    fetchData();
  }, [ipfs, isIpfsReady, letterToIssue, studentName,
    getIPFSDataFromContentID, parseJson, setTeachingAlgorithm])

  // Fetch student name
  useEffect(() => {
    async function fetchStudentName() {
      if (lesson?.student) {
        const pseudonym = await getPseudonym(lesson.student);
        if (pseudonym) {
          setStudentName(pseudonym);
        }
      }
    }
    fetchStudentName();
  }, [lesson?.student, getPseudonym, setStudentName])

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
      if (letterToIssue) {
        if (stage === 'success' || stage === 'next_skill') {
          const preparedLetter: Letter = {
            ...letterToIssue,
            valid: stage === 'success',
            lastExamined: (new Date()).getTime(),
            examCount: letterToIssue.examCount + 1
          };
          await putLetter(preparedLetter);
          updateLearned();
        } else if (stage === 'skip') {
          updateLearned();
        }
      }
    },
    [updateLearned, letterToIssue, putLetter]
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

  useEffect(() => {
    async function onLessonUpdate() {
      if (lesson) {
        if (lesson.reexamineStep < lesson.toReexamineCount) {
          setReexamined(false);
        } else {
          setReexamined(true);
        }
        if (lesson.learnStep < letterIds.length) {
          const nextLetterId = letterIds[lesson.learnStep];
          const nextLetter: Letter | undefined = await getLetter(nextLetterId);
          if (nextLetter) {
            setLetterToIssue(nextLetter);
          }
        }
        if (lesson.reexamineStep < insuranceIds.length) {
          const nextInsuranceId = insuranceIds[lesson.reexamineStep];
          const nextInsurance: Insurance | undefined = await getInsurance(nextInsuranceId);
          if (nextInsurance) {
            setInsuranceToReexamine(nextInsurance);
          }
        }
        if (lesson.learnStep === lesson.toLearnCount && lesson.reexamineStep === lesson.toReexamineCount) {
          setResultsShown(true);
        }
      }
    }
    onLessonUpdate();
  }, [lesson, letterIds, insuranceIds, studentName, areResultsShown,
    setReexamined, getLetter, setLetterToIssue, getInsurance,
    setInsuranceToReexamine, onShowResults])

  const onCloseTutoring = useCallback(async () => {
    await deleteSetting(SettingKey.LESSON);
    setLesson(null);
  }, [deleteSetting, setLesson]);

  const onCloseResults = useCallback(() => {
    setResultsShown(false);
    onCloseTutoring();
  }, [setResultsShown, onCloseTutoring]);

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const qrData = {
    q: QRAction.TUTOR_IDENTITY,
    n: name,
    p: publicKeyHex,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url: string = getBaseUrl() + `/#/knowledge?tutor=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  const lessonReactKey = lesson ? (lesson.learnStep + lesson.reexamineStep) : 'loading';

  const reexamAndDiplomaIssuing = <>
    {lesson && <StyledProgress
      value={lesson.learnStep + lesson.reexamineStep}
      total={lesson.toLearnCount + lesson.toReexamineCount}
    />}
    <StyledTutoringCloseButton onClick={onCloseTutoring}
      icon='close'
    />
    <div style={!reexamined ? {} : { display: 'none' }}>
      {currentPair && <Reexamine currentPair={currentPair} insurance={insuranceToReexamine} onResult={updateReexamined} studentName={studentName} key={'reexaminine' + lessonReactKey} />}
    </div>
    <div style={reexamined ? {} : { display: 'none' }}>
      {teachingAlgorithm && <DoInstructions algorithm={teachingAlgorithm} onResult={updateTutoring} key={'learn' + lessonReactKey} />}
    </div>
  </>;

  return (
    <div className={`toolbox--Tutor ${className}`}>
      {
        isLoggedIn &&
        <>
          <LessonRequestReceiver setCurrentLesson={setLesson} />
          {lesson == null ?
            <>
              <CenterQRContainer>
                <h2>{t('Show to a student to begin tutoring')}</h2>
                <QRWithShareAndCopy
                  dataQR={qrCodeText}
                  titleShare={t('QR code')}
                  textShare={t('Press the link to start learning')}
                  urlShare={url}
                  dataCopy={url} />
              </CenterQRContainer>
              <LessonsList tutor={publicKeyHex} onResumeTutoring={onResumeTutoring} onShowResults={onShowResults} />
            </>
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

export const StyledTutoringCloseButton = styled(Button)`
  position: fixed;
  width: 40px;
  top: 95px;
  right: 10px;
  z-index: 1;
  @media (min-width: 768px) {
    left: 50%;
    transform: translateX(-50%) translateX(375px);
  }
`;

export default React.memo(Tutor);

