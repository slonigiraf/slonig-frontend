// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BN from 'bn.js';
import { styled, Button, Progress, Modal } from '@polkadot/react-components';
import { useApi, useBlockTime, useToggle } from '@polkadot/react-hooks';
import { u8aToHex, BN_ONE, BN_ZERO } from '@polkadot/util';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { QRWithShareAndCopy, getBaseUrl, getIPFSDataFromContentID, parseJson, useIpfsContext, nameFromKeyringPair, QRAction, useLoginContext, LoginButton, CenterQRContainer, QRField, useInfo, SettingKey } from '@slonigiraf/app-slonig-components';
import { Letter } from '@slonigiraf/app-recommendations';
import { deleteSetting, getLessonId, getSetting, storeLesson, storePseudonym, storeSetting, updateLesson, updateLetter } from '../utils.js';
import Reexamine from './Reexamine.js';
import { TeachingAlgorithm } from './TeachingAlgorithm.js';
import DoInstructions from './DoInstructions.js';
import { useTranslation } from '../translate.js';
import { getPseudonym } from '../utils.js';
import { Insurance } from '../db/Insurance.js';
import LessonsList from './LessonsList.js';
import { Lesson } from '../db/Lesson.js';
import { db } from "../db/index.js";
import LessonResults from './LessonResults.js';

interface Props {
  className?: string;
}

function Tutor({ className = '' }: Props): React.ReactElement<Props> {
  // Initialize api, ipfs and translation
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { api } = useApi();
  const { showInfo } = useInfo();
  const { t } = useTranslation();
  const [lessonId, setLessonId] = useState<string | null>(null);

  // Initialize account
  const { currentPair, isLoggedIn } = useLoginContext();

  // Process query
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const studentNameFromUrl = queryParams.get("name");
  const lessonIdFromUrl = queryParams.get("lesson");
  const queryData = queryParams.get("d") || "";
  const [tutorFromUrl, skillCIDFromUrl, studentIdentityFromUrl, studentFromUrl, cidRFromUrl,
    genesisRFromUrl, nonceRFromUrl, blockRFromUrl, blockAllowedRFromUrl, tutorRFromUrl,
    studentRFromUrl, amountRFromUrl, signOverPrivateDataRFromUrl, signOverReceiptRFromUrl, studentSignRFromUrl] = queryData.split(' ');

  const [insuranceToReexamine, setInsuranceToReexamine] = useState<Insurance | null>(null);
  const [letterToIssue, setLetterToIssue] = useState<Letter | null>(null);

  const [skill, setSkill] = useState<Skill | null>(null); //Use in case of url data transfer
  
  // Store progress state
  const [canIssueDiploma, setCanIssueDiploma] = useState(true);
  const [reexamined, setReexamined] = useState<boolean>(false);
  const [teachingAlgorithm, setTeachingAlgorithm] = useState<TeachingAlgorithm | null>(null);

  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  //   show stake and days or hide
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [letterIds, setLetterIds] = useState<number[]>([]);
  const [insuranceIds, setInsuranceIds] = useState<number[]>([]);
  const [areResultsShown, setResultsShown] = useState(false);
  const [daysInputValue, setDaysInputValue] = useState<string>(lesson ? lesson.dValidity.toString() : "0"); //To allow empty strings
  const [countOfValidLetters, setCountOfValidLetters] = useState(0);
  

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
  async function fetchLessonId() {
    const lessonId = await getSetting(SettingKey.LESSON);
    if (lessonId !== undefined) {
      setLessonId(lessonId);
    } else {
      setLessonId(null);
    }
  }

  useEffect(() => {
    fetchLessonId();
  }, [lessonIdFromUrl])

  useEffect(() => {
    async function fetchLesson() {
      if (lessonId) {
        const fetchedLesson = await db.lessons.get(lessonId);
        setLesson(fetchedLesson || null); // Set lesson or null if not found
      }
    }
    fetchLesson();
  }, [lessonId]);

  useEffect(() => {
    if (lessonId) {
      const fetchLetterIds = async () => {
        const fetchedLetters = await db.letters.where({ lesson: lessonId }).sortBy('id');
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
        const fetchedInsurances = await db.insurances.where({ lesson: lessonId }).sortBy('id');
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
          setSkill(skillJson);
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
  useEffect(() => {
    async function fetchStudentName() {
      if (lesson && lesson.dValidity.toString() !== daysInputValue) {
        setDaysInputValue(lesson.dValidity.toString());
      }
    }
    fetchStudentName()
  }, [lesson])

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
        if (stage === 'success') {
          const preparedLetter: Letter = { ...letterToIssue, valid: true };
          await updateLetter(preparedLetter);
          updateLearned();
        } else if (stage === 'skip') {
          const skippedLetter: Letter = { ...letterToIssue, wasSkipped: true };
          await updateLetter(skippedLetter);
          updateLearned();
        }
      }
    },
    [
      setCanIssueDiploma, updateLearned, letterToIssue, updateLetter
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
          const nextLetter: Letter | undefined = await db.letters.get(nextLetterId);
          if (nextLetter) {
            setLetterToIssue(nextLetter);
          }
        }
        if (lesson.reexamineStep < insuranceIds.length) {
          const nextInsuranceId = insuranceIds[lesson.reexamineStep];
          const nextInsurance: Insurance | undefined = await db.insurances.get(nextInsuranceId);
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

  const onCloseTutoring = useCallback(() => {
    deleteSetting(SettingKey.LESSON);
    setLessonId(null);
    setLesson(null);
  }, []);

  const onCloseResults = useCallback(() => {
    onCloseTutoring();
    setResultsShown(false)
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

  const tutorIdsMath = tutorFromUrl && publicKeyHex && (tutorFromUrl === publicKeyHex);
  const isDedicatedTutor = tutorIdsMath || lesson != null;


  // Process url data
  useEffect(() => {
    if (studentIdentityFromUrl && studentNameFromUrl) {
      async function storeUrlData() {
        try {
          // Ensure that both publicKey and name are strings
          if (typeof studentIdentityFromUrl === 'string' && typeof studentNameFromUrl === 'string' && skill != null && skillCIDFromUrl) {
            await storePseudonym(studentIdentityFromUrl, studentNameFromUrl);
            await setStudentName(studentNameFromUrl);
            const lessonId = getLessonId([skill.i]);
            const qrJSON: any = { [QRField.ID]: lessonId, [QRField.PERSON_IDENTITY]: studentIdentityFromUrl };
            const webRTCJSON: any = {
              'cid': skillCIDFromUrl,
              'learn': [[skill.i, skillCIDFromUrl, studentFromUrl]],
              'reexamine': [
                [cidRFromUrl, genesisRFromUrl, nonceRFromUrl, blockRFromUrl, blockAllowedRFromUrl,
                  tutorRFromUrl, studentRFromUrl, amountRFromUrl, signOverPrivateDataRFromUrl,
                  signOverReceiptRFromUrl, studentSignRFromUrl]
              ]
            };
            storeLesson(tutorFromUrl, qrJSON, webRTCJSON);
            storeSetting(SettingKey.LESSON, lessonId);
            fetchLessonId();
          }
        } catch (error) {
          console.error("Failed to save url data:", error);
        }
      }
      if (isDedicatedTutor && skill && skill.i) {
        storeUrlData();
      }
    }
  }, [skill, isDedicatedTutor, studentNameFromUrl, tutorFromUrl, skillCIDFromUrl, studentIdentityFromUrl, studentFromUrl, cidRFromUrl,
    genesisRFromUrl, nonceRFromUrl, blockRFromUrl, blockAllowedRFromUrl, tutorRFromUrl,
    studentRFromUrl, amountRFromUrl, signOverPrivateDataRFromUrl, signOverReceiptRFromUrl, studentSignRFromUrl]);

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

  if (!isDedicatedTutor && tutorFromUrl) {
    showInfo('Student has shown you a QR code created for a different tutor. Ask them to scan your QR code.', 'error');
  }

  return (
    <div className={`toolbox--Tutor ${className}`}>
      {
        isLoggedIn && (
          (lesson == null) ?
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
            <> {areResultsShown ? <LessonResults lesson={lesson} updateAndStoreLesson={updateAndStoreLesson} onClose={onCloseResults}/> : reexamAndDiplomaIssuing}</>
        )
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

