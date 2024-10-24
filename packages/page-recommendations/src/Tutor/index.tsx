// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BN from 'bn.js';
import { statics } from '@polkadot/react-api/statics';
import { styled, Toggle, Button, Input, InputBalance, Icon, Card } from '@polkadot/react-components';
import { useApi, useBlockTime, useToggle } from '@polkadot/react-hooks';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN_ONE } from '@polkadot/util';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { QRWithShareAndCopy, getBaseUrl, getIPFSDataFromContentID, parseJson, useIpfsContext, nameFromKeyringPair, QRAction, useLoginContext, LoginButton, FullWidthContainer, AppContainer, VerticalCenterItemsContainer, CenterQRContainer, KatexSpan, QRField } from '@slonigiraf/app-slonig-components';
import { Letter } from '@slonigiraf/app-recommendations';
import { getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { getLastUnusedLetterNumber, getLessonId, getSetting, setLastUsedLetterNumber, storeLesson, storeLetter, storePseudonym, storeSetting } from '../utils.js';
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
  const { t } = useTranslation();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  // Initialize account
  const { currentPair, isLoggedIn } = useLoginContext();

  // Process query
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const studentNameFromUrl = queryParams.get("name");
  const queryData = queryParams.get("d") || "";
  const [tutorFromUrl, skillCIDFromUrl, studentIdentityFromUrl, studentFromUrl, cidRFromUrl,
    genesisRFromUrl, nonceRFromUrl, blockRFromUrl, blockAllowedRFromUrl, tutorRFromUrl,
    studentRFromUrl, amountRFromUrl, signOverPrivateDataRFromUrl, signOverReceiptRFromUrl, studentSignRFromUrl] = queryData.split(' ');
  const [tutor, setTutor] = useState(tutorFromUrl);
  const [skillCID, setSkillCID] = useState(skillCIDFromUrl);
  const [studentIdentity, setStudentIdentity] = useState(studentIdentityFromUrl);
  const [student, setStudent] = useState(studentFromUrl);
  // const [cidR, setCidR] = useState(cidRFromUrl);
  // const [genesisR, setGenesisR] = useState(genesisRFromUrl);
  // const [nonceR, setNonceR] = useState(nonceRFromUrl);
  // const [blockR, setBlockR] = useState(blockRFromUrl);
  // const [blockAllowedR, setBlockAllowedR] = useState(blockAllowedRFromUrl);
  // const [tutorR, setTutorR] = useState(tutorRFromUrl);
  // const [studentR, setStudentR] = useState(studentRFromUrl);
  // const [amountR, setAmountR] = useState(amountRFromUrl);
  // const [signOverPrivateDataR, setSignOverPrivateDataR] = useState(signOverPrivateDataRFromUrl);
  // const [signOverReceiptR, setSignOverReceiptR] = useState(signOverReceiptRFromUrl);
  // const [studentSignR, setStudentSignR] = useState(studentSignRFromUrl);
  const now = new Date();
  const insuranceFromUrl: Insurance | null = (tutorFromUrl && skillCIDFromUrl &&
    studentIdentityFromUrl && studentFromUrl && cidRFromUrl &&
    genesisRFromUrl && nonceRFromUrl && blockRFromUrl &&
    blockAllowedRFromUrl && tutorRFromUrl &&
    studentRFromUrl && amountRFromUrl &&
    signOverPrivateDataRFromUrl && signOverReceiptRFromUrl && studentSignRFromUrl) ? {
    created: now,
    lastReexamined: now,
    lesson: lesson ? lesson.id : '',
    forReexamining: true,
    wasDiscussed: false,
    wasSkipped: false,
    workerId: studentIdentity,
    cid: cidRFromUrl,
    genesis: genesisRFromUrl,
    letterNumber: parseInt(nonceRFromUrl, 10),
    block: blockRFromUrl,
    blockAllowed: blockAllowedRFromUrl,
    referee: tutorRFromUrl,
    worker: studentRFromUrl,
    amount: amountRFromUrl,
    signOverPrivateData: signOverPrivateDataRFromUrl,
    signOverReceipt: signOverReceiptRFromUrl,
    employer: currentPair ? u8aToHex(currentPair?.publicKey) : '',
    workerSign: studentSignRFromUrl,
    wasUsed: false,
  } : null;
  const [insuranceToReexamine, setInsuranceToReexamine] = useState(insuranceFromUrl);

  const [skill, setSkill] = useState<Skill | null>(null);



  // Store progress state
  const [canIssueDiploma, setCanIssueDiploma] = useState(false);
  const [reexamined, setReexamined] = useState<boolean>(insuranceToReexamine?.cid === undefined);
  const [teachingAlgorithm, setTeachingAlgorithm] = useState<TeachingAlgorithm | null>(null);



  // Initialize diploma details
  //   stake: 105 Slon, 12 zeroes for numbers after point
  const defaultStake: BN = new BN("105000000000000");
  const [amount, setAmount] = useState<BN>(defaultStake);
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
  const [studentName, setStudentName] = useState<string | undefined>(undefined);
  //   show stake and days or hide
  const [visibleDiplomaDetails, toggleVisibleDiplomaDetails, setVisibleDiplomaDetails] = useToggle(false);
  //   issued diploma
  const [diploma, setDiploma] = useState<Letter | null>(null);

  const [countOfUrlReloads, setCountOfUrlReloads] = useState(0);


  console.log("lesson: " + lesson)
  console.log("reexamined: " + reexamined)


  // Reinitialize issuing stage when url parameters change
  useEffect(() => {
    setVisibleDiplomaDetails(false);
    const hasAnySkillToReexamine = (insuranceToReexamine?.cid !== undefined);
    setReexamined(!hasAnySkillToReexamine);
    setCanIssueDiploma(false);
    setDiploma(null);
    setCountOfUrlReloads(prevKey => prevKey + 1);
  }, [tutor, skillCID, studentIdentity, student, insuranceToReexamine]);



  // Fetch skill data and set teaching algorithm
  useEffect(() => {
    async function fetchData() {
      if (isIpfsReady && skillCID) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, skillCID);
          const skillJson = parseJson(skillContent);
          setSkill(skillJson);
          const studentUsesSlonigFirstTime = insuranceToReexamine?.cid === undefined;
          setTeachingAlgorithm(new TeachingAlgorithm(t, studentNameFromUrl, skillJson, studentUsesSlonigFirstTime));
        }
        catch (e) {
          console.log(e);
        }
      }
    }
    fetchData()
  }, [ipfs, skillCID, studentNameFromUrl])

  // Fetch student name
  useEffect(() => {
    async function fetchStudentName() {
      if (studentIdentity) {
        const pseudonym = await getPseudonym(studentIdentity);
        if (name) {
          setStudentName(pseudonym);
        }
      }
    }
    fetchStudentName()
  }, [studentIdentity])

  async function fetchLesson(id?: string) {
    const lessonId = id? id : await getSetting('lesson');
    if (lessonId !== undefined) {
      const activeLesson: Lesson = await db.lessons.get(lessonId);
      setLesson(activeLesson);
      if (activeLesson !== undefined) {
        setStudentIdentity(activeLesson.student);
      }
    }
  }

  useEffect(() => {
    fetchLesson()
  }, [])

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
    async () => {
      if (!currentPair) {
        return;
      }
      // generate a data to sign
      const genesisU8 = statics.api.genesisHash;
      const referee = currentPair;
      const refereeU8 = referee.publicKey;
      const refereePublicKeyHex = u8aToHex(refereeU8);
      const letterId = await getLastUnusedLetterNumber(refereePublicKeyHex);
      const workerPublicKeyU8 = hexToU8a(student);
      const privateData = getPrivateDataToSignByReferee(skillCID, genesisU8, letterId, diplomaBlockNumber, refereeU8, workerPublicKeyU8, amount);
      const receipt = getPublicDataToSignByReferee(genesisU8, letterId, diplomaBlockNumber, refereeU8, workerPublicKeyU8, amount);
      const refereeSignOverPrivateData = u8aToHex(currentPair.sign(u8aWrapBytes(privateData)));
      const refereeSignOverReceipt = u8aToHex(currentPair.sign(u8aWrapBytes(receipt)));

      const letter: Letter = {
        created: new Date(),
        knowledgeId: skill ? skill.i : '',
        reexamCount: 0,
        cid: skillCID,
        lesson: '',
        workerId: studentIdentity,
        genesis: genesisU8.toHex(),
        letterNumber: letterId,
        block: diplomaBlockNumber.toString(),
        referee: refereePublicKeyHex,
        worker: student,
        amount: amount.toString(),
        signOverPrivateData: refereeSignOverPrivateData,
        signOverReceipt: refereeSignOverReceipt,
        valid: true,
        wasDiscussed: true,
        wasSkipped: false,
      };
      await storeLetter(letter);
      await setLastUsedLetterNumber(refereePublicKeyHex, letterId);
      createDiplomaQR(letter);
      setDiploma(letter);
    },
    [currentPair, ipfs, skill, student, diplomaBlockNumber, amount]
  );

  const updateReexamined = (): void => {
    setReexamined(true);
  };

  const updateTutoring = (stage: string): void => {
    if (stage === 'success') {
      setCanIssueDiploma(true);
    } else {
      setCanIssueDiploma(false);
    }
  };

  const onResumeTutoring = (lesson: Lesson): void => {
    storeSetting('lesson', lesson.id);
    setLesson(lesson);
  }

  useEffect(() => {
    async function onLessonUpdate() {
      if (lesson) {
        const studentUsesSlonigFirstTime = lesson.toReexamineCount === 0;
        const name = studentName ? studentName : '';
        if (lesson.reexamineStep < lesson.toReexamineCount) {
          setReexamined(false);
        }
        setTeachingAlgorithm(new TeachingAlgorithm(t, name, skill, studentUsesSlonigFirstTime));
      }
    }
    onLessonUpdate()
  }, [lesson])

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const qrData = {
    q: QRAction.TUTOR_IDENTITY,
    n: name,
    p: publicKeyHex,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url: string = getBaseUrl() + `/#/knowledge?tutor=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  const isDedicatedTutor = (tutor === publicKeyHex) || !tutor;

  // Process url data
  useEffect(() => {
    if (studentIdentityFromUrl && studentNameFromUrl) {
      async function storeUrlData() {
        try {
          // Ensure that both publicKey and name are strings
          if (typeof studentIdentityFromUrl === 'string' && typeof studentNameFromUrl === 'string' && skill != null) {
            await storePseudonym(studentIdentityFromUrl, studentNameFromUrl);
            await setStudentName(studentNameFromUrl);
            const lessonId = getLessonId([skill.i]);
            const qrJSON: any = { [QRField.ID]: lessonId, [QRField.PERSON_IDENTITY]: studentIdentityFromUrl };
            const webRTCJSON: any = {
              'learn': [[skill.i, skillCIDFromUrl, studentFromUrl]],
              'reexamine': [
                [cidRFromUrl, genesisRFromUrl, nonceRFromUrl, blockRFromUrl, blockAllowedRFromUrl,
                  tutorRFromUrl, studentRFromUrl, amountRFromUrl, signOverPrivateDataRFromUrl,
                  signOverReceiptRFromUrl, studentSignRFromUrl]
              ]
            };
            storeLesson(tutorFromUrl, qrJSON, webRTCJSON);
            storeSetting('lesson', lessonId);
            fetchLesson(lessonId);
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

  const diplomaSlon = new BN(amount).div(new BN("1000000000000"));

  const diplomaView = <FullWidthContainer>
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
  </FullWidthContainer>;

  const reexamAndDiplomaIssuing = <>
    <div style={!reexamined ? {} : { display: 'none' }}>
      {currentPair && <Reexamine currentPair={currentPair} insurance={insuranceToReexamine} onResult={updateReexamined} key={countOfUrlReloads} studentName={studentNameFromUrl} />}
    </div>
    <div style={reexamined ? {} : { display: 'none' }}>
      <DoInstructions algorithm={teachingAlgorithm} onResult={updateTutoring} key={countOfUrlReloads} />
    </div>
    {
      canIssueDiploma &&
      <FullWidthContainer>
        <VerticalCenterItemsContainer>
          <Card>
            <div className='ui--row'>
              <h2>{t('Diploma')}</h2>
            </div>
            <table>
              <tbody>
                <tr>
                  <td><Icon icon='graduation-cap' /></td>
                  <td>{skill ? <KatexSpan content={skill.h} /> : ''}</td>
                </tr>
                <tr>
                  <td><Icon icon='person' /></td>
                  <td>{studentName}</td>
                </tr>
              </tbody>
            </table>
            <Toggle
              label={t('details')}
              onChange={toggleVisibleDiplomaDetails}
              value={visibleDiplomaDetails}
            />
            <div className='ui--row' style={visibleDiplomaDetails ? {} : { display: 'none' }}>
              <InputBalance
                help={t('Stake reputation help info')}
                isZeroable
                label={t('stake Slon')}
                onChange={setAmount}
                defaultValue={amount}
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
          </Card>
          <div>
            <Button
              icon='dollar'
              isDisabled={!isIpfsReady}
              label={t('Sell the diploma')}
              onClick={_onSign}
            />
            {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
          </div>
        </VerticalCenterItemsContainer>
      </FullWidthContainer>
    }
  </>;

  return (
    <div className={`toolbox--Tutor ${className}`}>
      {
        isLoggedIn && (
          (student === undefined || !isDedicatedTutor) ?
            <><CenterQRContainer>
              {
                isDedicatedTutor ?
                  <h2>{t('Show to a student to begin tutoring')}</h2>
                  :
                  <h2>{t('Student has shown you a QR code created for a different tutor. Ask them to scan your QR code.')}</h2>
              }
              <QRWithShareAndCopy
                dataQR={qrCodeText}
                titleShare={t('QR code')}
                textShare={t('Press the link to start learning')}
                urlShare={url}
                dataCopy={url} />
            </CenterQRContainer>
              <LessonsList tutor={publicKeyHex} onResumeTutoring={onResumeTutoring} />
            </>
            :
            <> {diploma ? diplomaView : reexamAndDiplomaIssuing}</>
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

export default React.memo(Tutor);
