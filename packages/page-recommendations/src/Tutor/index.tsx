// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BN from 'bn.js';
import { statics } from '@polkadot/react-api/statics';
import { styled, Toggle, Button, Input, InputBalance, Icon, Card, Progress } from '@polkadot/react-components';
import { useApi, useBlockTime, useToggle } from '@polkadot/react-hooks';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN_ONE, BN_ZERO } from '@polkadot/util';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { QRWithShareAndCopy, getBaseUrl, getIPFSDataFromContentID, parseJson, useIpfsContext, nameFromKeyringPair, QRAction, useLoginContext, LoginButton, FullWidthContainer, VerticalCenterItemsContainer, CenterQRContainer, KatexSpan, QRField, useInfo, SettingKey } from '@slonigiraf/app-slonig-components';
import { Letter } from '@slonigiraf/app-recommendations';
import { getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { deleteSetting, getLastUnusedLetterNumber, getLessonId, getSetting, setLastUsedLetterNumber, storeLesson, storeLetter, storePseudonym, storeSetting, updateLesson, updateLetter } from '../utils.js';
import Reexamine from './Reexamine.js';
import { TeachingAlgorithm } from './TeachingAlgorithm.js';
import DoInstructions from './DoInstructions.js';
import { useTranslation } from '../translate.js';
import { getPseudonym } from '../utils.js';
import { Insurance } from '../db/Insurance.js';
import LessonsList from './LessonsList.js';
import { Lesson } from '../db/Lesson.js';
import { db } from "../db/index.js";

interface Props {
  className?: string;
}

const getDiplomaBlockNumber = (currentBlock: BN, blockTimeMs: number, secondsToAdd: number): BN => {
  const secondsToGenerateBlock = blockTimeMs / 1000;
  const blocksToAdd = new BN(secondsToAdd).div(new BN(secondsToGenerateBlock));
  const blockAllowed = currentBlock.add(blocksToAdd);
  return blockAllowed;
}

function letterAsArray(letter: Letter) {
  let result = [];
  result.push(letter.cid);                      // Skill CID
  result.push(letter.workerId);                 // Student Identity
  result.push(letter.genesis);                  // Genesis U8 Hex
  result.push(letter.letterNumber);             // Letter ID
  result.push(letter.block);                    // Diploma Block Number
  result.push(letter.referee);                  // Referee Public Key Hex
  result.push(letter.worker);                   // Student
  result.push(letter.amount);                   // Amount
  result.push(letter.signOverPrivateData);      // Referee Sign Over Private Data
  result.push(letter.signOverReceipt);          // Referee Sign Over Receipt
  return result;
}


function Tutor({ className = '' }: Props): React.ReactElement<Props> {
  // Initialize api, ipfs and translation
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { api, isApiReady } = useApi();
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

  const [skillCID, setSkillCID] = useState(skillCIDFromUrl);
  const [studentIdentity, setStudentIdentity] = useState(studentIdentityFromUrl);
  const now = new Date();
  const [insuranceToReexamine, setInsuranceToReexamine] = useState<Insurance | null>(null);
  const [letterToIssue, setLetterToIssue] = useState<Letter | null>(null);

  const [skill, setSkill] = useState<Skill | null>(null);

  // Store progress state
  const [canIssueDiploma, setCanIssueDiploma] = useState(true);
  const [reexamined, setReexamined] = useState<boolean>(false);
  const [teachingAlgorithm, setTeachingAlgorithm] = useState<TeachingAlgorithm | null>(null);

  // Initialize diploma details
  //   days
  const defaultDaysValid: number = 730;
  const [daysValid, setDaysValid] = useState<number>(defaultDaysValid);
  //   last block number
  const [currentBlockNumber, setCurrentBlockNumber] = useState(new BN(0));
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  const [diplomaBlockNumber, setDiplomaBlockNumber] = useState<BN>(new BN(0));
  //   raw diploma data
  const [diplomaText, setDiplomaText] = useState('');
  const [diplomaAddUrl, setDiplomaAddUrl] = useState('');
  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  //   show stake and days or hide
  const [visibleDiplomaDetails, toggleVisibleDiplomaDetails, setVisibleDiplomaDetails] = useToggle(true);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [letterIds, setLetterIds] = useState<number[]>([]);
  const [insuranceIds, setInsuranceIds] = useState<number[]>([]);
  const [areResultsShown, setResultsShown] = useState(true);

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
      if (isIpfsReady && skillCID) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, skillCID);
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
  }, [ipfs, skillCID, studentName])

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

  const setAmount = (value?: BN | undefined): void => {
    if (lesson && value && lesson.dWarranty !== value.toString()) {
      const updatedLesson = { ...lesson, dWarranty: value.toString() };
      updateAndStoreLesson(updatedLesson);
    }
  }
  const setDiplomaPrice = (value?: BN | undefined): void => {
    if (lesson && value && lesson.dPrice !== value.toString()) {
      const updatedLesson = { ...lesson, dPrice: value.toString() };
      updateAndStoreLesson(updatedLesson);
    }
  }

  // Fetch block number (once)
  useEffect(() => {
    async function fetchBlockNumber() {
      if (isApiReady) {
        try {
          const chainHeader = await api.rpc.chain.getHeader();
          const currentBlockNumber = new BN(chainHeader.number.toString());
          setCurrentBlockNumber(currentBlockNumber);
          const defaultSecondsValid = defaultDaysValid * 86400;
          const diplomaBlockNumber: BN = getDiplomaBlockNumber(currentBlockNumber, millisecondsPerBlock, defaultSecondsValid);
          setDiplomaBlockNumber(diplomaBlockNumber);
        } catch (error) {
          console.error("Error fetching block number: ", error);
        }
      }
    }
    fetchBlockNumber();
  }, [api, isApiReady]);

  const updateAndStoreLesson = useCallback(
    async (updatedLesson: Lesson | null) => {
      if (updatedLesson) {
        await updateLesson(updatedLesson);
      }
      setLesson(updatedLesson);
    },
    [setLesson, updateLesson]
  );

  const createDiplomaQR = useCallback((letter: Letter) => {
    const letterArray = letterAsArray(letter);
    const qrData = {
      q: QRAction.ADD_DIPLOMA,
      d: letterArray.join(",")
    };
    const qrCodeText = JSON.stringify(qrData);
    const url = getBaseUrl() + `/#/diplomas?d=${letterArray.join("+")}`;
    setDiplomaText(qrCodeText);
    setDiplomaAddUrl(url);
  }, [setDiplomaText, setDiplomaAddUrl]);

  const _onChangeDaysValid = useCallback(
    (value: string) => {
      const days = parseInt(value, 10); // Using base 10 for the conversion
      if (!isNaN(days)) {
        setDaysValid(days);
        const secondsToAdd = days * 86400; // 86400 - seconds in a day
        if (Number.isSafeInteger(secondsToAdd)) {
          const diplomaBlockNumber: BN = getDiplomaBlockNumber(currentBlockNumber, millisecondsPerBlock, secondsToAdd);
          setDiplomaBlockNumber(diplomaBlockNumber);
        }
      } else {
        setDaysValid(0);
      }
    },
    [currentBlockNumber]
  );

  // Sign diploma
  const _onSign = useCallback(
    async (lesson: Lesson) => {
      if (!currentPair || !letterToIssue || !lesson) {
        return;
      }
      const letters: Letter[] = await db.letters.where({ lesson: lessonId }).filter(letter => letter.valid).toArray();
      const genesisU8 = statics.api.genesisHash;
      const referee = currentPair;
      const refereeU8 = referee.publicKey;
      const refereePublicKeyHex = u8aToHex(refereeU8);
      const amount = new BN(lesson.dWarranty);

      letters.forEach(async letterFromDB => {
        // generate a data to sign

        const letterId = letterFromDB.letterNumber >= 0 ? letterFromDB.letterNumber : await getLastUnusedLetterNumber(refereePublicKeyHex);
        const workerPublicKeyU8 = hexToU8a(letterFromDB.worker);
        const privateData = getPrivateDataToSignByReferee(letterFromDB.cid, genesisU8, letterId, diplomaBlockNumber, refereeU8, workerPublicKeyU8, amount);
        const receipt = getPublicDataToSignByReferee(genesisU8, letterId, diplomaBlockNumber, refereeU8, workerPublicKeyU8, amount);
        const refereeSignOverPrivateData = u8aToHex(currentPair.sign(u8aWrapBytes(privateData)));
        const refereeSignOverReceipt = u8aToHex(currentPair.sign(u8aWrapBytes(receipt)));

        const updatedLetter: Letter = {
          ...letterFromDB,
          created: now,
          lastReexamined: now,
          reexamCount: 0,
          genesis: genesisU8.toHex(),
          letterNumber: letterId,
          block: diplomaBlockNumber.toString(),
          referee: refereePublicKeyHex,
          amount: amount.toString(),
          signOverPrivateData: refereeSignOverPrivateData,
          signOverReceipt: refereeSignOverReceipt,
        };
        await updateLetter(updatedLetter);
        await setLastUsedLetterNumber(refereePublicKeyHex, letterId);
      });



      // createDiplomaQR(letter);
      // setDiploma(letter);
    },
    [currentPair, diplomaBlockNumber, lesson]
  );

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
    await _onSign(lesson);
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
            setSkillCID(nextLetter.cid);
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
  }, [lesson, letterIds, insuranceIds, studentName])

  const onCloseTutoring = useCallback(() => {
    deleteSetting(SettingKey.LESSON);
    setLessonId(null);
    setLesson(null);
  }, []);

  const onCloseResults = useCallback(() => {
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
          if (typeof studentIdentityFromUrl === 'string' && typeof studentNameFromUrl === 'string' && skill != null && skillCID) {
            await storePseudonym(studentIdentityFromUrl, studentNameFromUrl);
            await setStudentName(studentNameFromUrl);
            const lessonId = getLessonId([skill.i]);
            const qrJSON: any = { [QRField.ID]: lessonId, [QRField.PERSON_IDENTITY]: studentIdentityFromUrl };
            const webRTCJSON: any = {
              'cid': skillCID,
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
  }, [skillCID, skill, isDedicatedTutor, studentNameFromUrl, tutorFromUrl, skillCIDFromUrl, studentIdentityFromUrl, studentFromUrl, cidRFromUrl,
    genesisRFromUrl, nonceRFromUrl, blockRFromUrl, blockAllowedRFromUrl, tutorRFromUrl,
    studentRFromUrl, amountRFromUrl, signOverPrivateDataRFromUrl, signOverReceiptRFromUrl, studentSignRFromUrl]);

  const diplomaSlon = lesson ? new BN(lesson.dWarranty).div(new BN("1000000000000")) : BN_ZERO;

  const diplomaView = <FullWidthContainer>
    <StyledResultsCloseButton onClick={onCloseResults}
      icon='close'
    />
    <VerticalCenterItemsContainer>

      <DiplomaDiv>
        <Card>
          <CenterQRContainer>
            <h2>{t('Show the diploma to your student')}</h2>
            <QRWithShareAndCopy
              dataQR={diplomaText}
              titleShare={t('QR code')}
              textShare={t('Press the link to add the diploma')}
              urlShare={diplomaAddUrl}
              dataCopy={diplomaAddUrl} />
          </CenterQRContainer>
          <div className="table">
            <div className="row">
              <div className="cell"><Icon icon='graduation-cap' /></div>
              <div className="cell">{skill ? <KatexSpan content={skill.h} /> : ''}</div>
            </div>
            <div className="row">
              <div className="cell"><Icon icon='user' /></div>
              <div className="cell">{studentName}</div>
            </div>
            <div className="row">
              <div className="cell"><Icon icon='shield' /></div>
              <div className="cell">{diplomaSlon.toString()} Slon {t('warranty')}</div>
            </div>
            <div className="row">
              <div className="cell"><Icon icon='clock-rotate-left' /></div>
              <div className="cell">{daysValid.toString()} {t('days valid')}</div>
            </div>
          </div>
        </Card>


      </DiplomaDiv>

    </VerticalCenterItemsContainer>
    <div className='ui--row'>
      <Toggle
        label={t('details')}
        onChange={toggleVisibleDiplomaDetails}
        value={visibleDiplomaDetails}
      />
    </div>

    <div className='ui--row' style={visibleDiplomaDetails ? {} : { display: 'none' }}>
      <InputBalance
        isZeroable
        label={t('receive payment for each diploma')}
        onChange={setDiplomaPrice}
        defaultValue={lesson? new BN(lesson.dPrice) : BN_ZERO}
      />
    </div>
    <div className='ui--row' style={visibleDiplomaDetails ? {} : { display: 'none' }}>
      <InputBalance
        isZeroable
        label={t('stake for each diploma')}
        onChange={setAmount}
        defaultValue={lesson? new BN(lesson.dWarranty) : BN_ZERO}
      />
    </div>
    <div className='ui--row' style={visibleDiplomaDetails ? {} : { display: 'none' }}>
      <Input
        className='full'
        label={t('days valid')}
        onChange={_onChangeDaysValid}
        value={daysValid.toString()}
      />
    </div>
  </FullWidthContainer>;

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
            <> {areResultsShown ? diplomaView : reexamAndDiplomaIssuing}</>
        )
      }
      <LoginButton label={t('Log in')} />
    </div>
  );
}

const DiplomaDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  .qr--row {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  Card {
    width: 100%; // Adjust this as needed
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .table {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .row {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .cell {
    padding: 5px; // Add padding for spacing
    // Add any additional styling you need for cells
  }

  .row .cell:first-child {
    flex: 0 1 auto; // Allow shrinking but no growth, auto basis
    white-space: nowrap; // Prevents text from wrapping
    min-width: 30px;
  }

  .row .cell:nth-child(2) {
    flex: 1; // Take up the remaining space
  }
`;
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
export const StyledResultsCloseButton = styled(Button)`
  position: absolute;
  width: 40px;
  top: 50px;
  right: 10px;
  z-index: 1;
`;
export default React.memo(Tutor);

