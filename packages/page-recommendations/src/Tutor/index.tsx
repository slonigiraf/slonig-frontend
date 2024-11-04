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
  const [lessonId, setLessonId] = useState<string | null>(null);

  // Initialize account
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
    async function fetchLessonId() {
      const lessonId = await getSetting(SettingKey.LESSON);
      if (lessonId !== undefined) {
        setLessonId(lessonId);
      } else {
        setLessonId(null);
      }
    }
    fetchLessonId();
  }, [])

  useEffect(() => {
    async function fetchLesson() {
      if (lessonId) {
        const fetchedLesson = await getLesson(lessonId);
        setLesson(fetchedLesson || null); // Set lesson or null if not found
      }
    }
    fetchLesson();
  }, [lessonId]);

  useEffect(() => {
    if (lessonId) {
      const fetchLetterIds = async () => {
        const fetchedLetters = await getLettersByLessonId(lessonId);
        if (fetchedLetters) {
          const ids = fetchedLetters.map(letter => letter.id).filter(id => id !== undefined);
          setLetterIds(ids);
        }
      };
      fetchLetterIds();
    }
  }, [lessonId]);

  useEffect(() => {
    if (lessonId) {
      const fetchInsuranceIds = async () => {
        const fetchedInsurances = await getInsurancesByLessonId(lessonId);
        if (fetchedInsurances) {
          const ids = fetchedInsurances.map(insurance => insurance.id).filter(id => id !== undefined);
          setInsuranceIds(ids);
        }
      };
      fetchInsuranceIds();
    }
  }, [lessonId]);

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
    fetchData()
  }, [ipfs, letterToIssue, studentName])

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
    fetchStudentName()
  }, [lesson])

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
    if (letterIds.length > 0 && lesson) {
      const updatedLesson = { ...lesson, learnStep: lesson.learnStep + 1 };
      updateAndStoreLesson(updatedLesson);
    }
  }, [letterIds, lesson, updateAndStoreLesson]);

  const updateTutoring = useCallback(
    async (stage: string) => {
      if (letterToIssue) {
        const now = (new Date).getTime();
        if (stage === 'success') {
          const preparedLetter: Letter = { ...letterToIssue, valid: true, created: now, lastReexamined: now };
          await putLetter(preparedLetter);
          updateLearned();
        } else if (stage === 'skip') {
          const skippedLetter: Letter = { ...letterToIssue, wasSkipped: true };
          await putLetter(skippedLetter);
          updateLearned();
        }
      }
    },
    [
      updateLearned, letterToIssue, putLetter
    ]
  );

  const onResumeTutoring = (lesson: Lesson): void => {
    storeSetting(SettingKey.LESSON, lesson.id);
    setLessonId(lesson.id);
  }
  const onShowResults = async (lesson: Lesson) => {
    storeSetting(SettingKey.LESSON, lesson.id);
    setLesson(lesson);
    setResultsShown(true);
  }

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
          onShowResults(lesson);
        }
      }
    }
    onLessonUpdate()
  }, [lesson, letterIds, insuranceIds, studentName, areResultsShown])

  const onCloseTutoring = useCallback(async () => {
    await deleteSetting(SettingKey.LESSON);
    setLessonId(null);
    setLesson(null);
  }, []);

  const onCloseResults = useCallback(() => {
    setResultsShown(false);
    onCloseTutoring();
  }, []);

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
          <LessonRequestReceiver setCurrentLessonId={setLessonId} />
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
      <LoginButton label={t('Log in')} />
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

