// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import BN from 'bn.js';
import { statics } from '@polkadot/react-api/statics';
import { styled, Button, Input, InputBalance, Icon, Card, Modal } from '@polkadot/react-components';
import { useApi, useBlockTime, useToggle } from '@polkadot/react-hooks';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN_ONE, BN_ZERO } from '@polkadot/util';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { QRWithShareAndCopy, getBaseUrl, getIPFSDataFromContentID, parseJson, useIpfsContext, nameFromKeyringPair, QRAction, useLoginContext, FullWidthContainer, VerticalCenterItemsContainer, CenterQRContainer, KatexSpan, useInfo, SettingKey } from '@slonigiraf/app-slonig-components';
import { Letter } from '@slonigiraf/app-recommendations';
import { getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { getLastUnusedLetterNumber, setLastUsedLetterNumber, storeSetting, updateLetter } from '../utils.js';
import { useTranslation } from '../translate.js';
import { getPseudonym } from '../utils.js';
import { Lesson } from '../db/Lesson.js';
import { db } from "../db/index.js";

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

interface Props {
  className?: string;
  lesson: Lesson | null;
  updateAndStoreLesson: (lesson: Lesson | null) => void;
  onClose: () => void;
}

function LessonResults({ className = '', lesson, updateAndStoreLesson, onClose }: Props): React.ReactElement<Props> {
  // Initialize api, ipfs and translation
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { api, isApiReady } = useApi();
  const { showInfo } = useInfo();
  const { t } = useTranslation();
  const { currentPair, isLoggedIn } = useLoginContext();
  const now = (new Date()).getTime();


  const [lessonName, setLessonName] = useState<string>('');
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  const [canIssueDiploma, setCanIssueDiploma] = useState(true); // TODO defaults to false
  const [diplomaText, setDiplomaText] = useState('');
  const [diplomaAddUrl, setDiplomaAddUrl] = useState('');
  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  const [daysInputValue, setDaysInputValue] = useState<string>(lesson ? lesson.dValidity.toString() : "0"); //To allow empty strings
  const [countOfValidLetters, setCountOfValidLetters] = useState(0);
  const [countOfDiscussedInsurances, setCountOfDiscussedInsurances] = useState(0);
  const [countOfReceivingBonuses, setCountOfReceivingBonuses] = useState(0);
  const [valueOfBonuses, setValueOfBonuses] = useState<BN>(BN_ZERO);

  const [diplomaWarrantyInSlon, setDiplomaWarrantyInSlon] = useState<BN>(BN_ZERO);
  const [diplomaPriceInSlon, setDiplomaPriceInSlon] = useState<BN>(BN_ZERO);
  const [totalProfitForLetters, setTotalProfitForLetters] = useState<BN>(BN_ZERO);
  const [visibleDiplomaDetails, toggleVisibleDiplomaDetails] = useToggle(false);
 
  // Helper functions

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

  // Fetch required info from DB about current lesson
  useEffect(() => {
    async function fetchData() {
      if (isIpfsReady && lesson?.cid) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, lesson?.cid);
          const skillJson: Skill = parseJson(skillContent);
          setLessonName(skillJson.h);
        }
        catch (e) {
          console.log(e);
        }
      }
    }
    fetchData()
  }, [ipfs, lesson?.cid, studentName])

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
  }, [lesson?.student])

  useEffect(() => {
    async function fetchDaysValid() {
      if (lesson && lesson.dValidity.toString() !== daysInputValue) {
        setDaysInputValue(lesson.dValidity.toString());
      }
    }
    fetchDaysValid()
  }, [lesson?.dValidity])

  useEffect(() => {
    async function updateWarrantyInSlon() {
      if (lesson) {
        setDiplomaWarrantyInSlon(lesson ? new BN(lesson.dWarranty).div(new BN("1000000000000")) : BN_ZERO);
      }
    }
    updateWarrantyInSlon()
  }, [lesson?.dWarranty])

  useEffect(() => {
    async function updateDiplomaAndLessonPriceInSlon() {
      if (lesson) {
        setDiplomaPriceInSlon(lesson ? new BN(lesson.dPrice).div(new BN("1000000000000")) : BN_ZERO);
        setTotalProfitForLetters(new BN(countOfValidLetters).mul(diplomaPriceInSlon));
      }
    }
    updateDiplomaAndLessonPriceInSlon()
  }, [lesson?.dPrice, countOfValidLetters])


  // Update lesson properties in case edited
  const setAmount = useCallback((value?: BN | undefined): void => {
    if (lesson && value && lesson.dWarranty !== value.toString()) {
      const updatedLesson = { ...lesson, dWarranty: value.toString() };
      updateAndStoreLesson(updatedLesson);
      storeSetting(SettingKey.DIPLOMA_WARRANTY, value.toString());
    }
  }, [lesson, updateAndStoreLesson]);

  const setDiplomaPrice = useCallback((value?: BN | undefined): void => {
    if (lesson && value && lesson.dPrice !== value.toString()) {
      const updatedLesson = { ...lesson, dPrice: value.toString() };
      updateAndStoreLesson(updatedLesson);
      storeSetting(SettingKey.DIPLOMA_PRICE, value.toString());
    }
  }, [lesson, updateAndStoreLesson]);

  const setDaysValid = useCallback(
    (value: string) => {
      setDaysInputValue(value); // Update the input field's temporary value

      // If the input is empty, don’t store it in lesson; only store valid numbers
      if (value === "") return;

      const days = parseInt(value, 10);
      if (!isNaN(days) && days >= 0 && lesson) {
        const updatedLesson: Lesson = { ...lesson, dValidity: days };
        updateAndStoreLesson(updatedLesson);
        storeSetting(SettingKey.DIPLOMA_VALIDITY, days.toString());
      }
    },
    [lesson, updateAndStoreLesson]
  );

  useEffect(() => {
    if (lesson) {
      const updateInsurancesStat = async () => {
        if (lesson?.reexamineStep > 0) {
          const fetchedInsurances = await db.insurances.where({ lesson: lesson.id }).sortBy('id');
          if (fetchedInsurances) {
            const usedInsurances = fetchedInsurances.filter(insurance => insurance.wasUsed);
            const calculatedDiscussedInsurances = lesson.reexamineStep - fetchedInsurances.filter(insurance => insurance.wasSkipped).length;

            const countOfBonuses = usedInsurances.length;
            const amountOfBonuses = usedInsurances.reduce(
              (sum, insurance) => sum.add(new BN(insurance.amount)),
              new BN(0)
            );
            setCountOfReceivingBonuses(countOfBonuses);
            setValueOfBonuses(amountOfBonuses);
            setCountOfDiscussedInsurances(calculatedDiscussedInsurances);
          }
        }
      };
      updateInsurancesStat();
    }
  }, [lesson?.reexamineStep]);

  // Sign diploma
  useEffect(() => {
    const signLetters = async () => {
      if (!isApiReady || !currentPair || !lesson) {
        return;
      }
      const dontSign = (lesson.dWarranty === '0' || lesson.dValidity === 0);
      try {
        // Calculate block number
        const chainHeader = await api.rpc.chain.getHeader();
        const currentBlockNumber = new BN(chainHeader.number.toString());
        const secondsValid = lesson.dValidity * 86400;

        const diplomaBlockNumber: BN = getDiplomaBlockNumber(currentBlockNumber, millisecondsPerBlock, secondsValid);

        // // Get diplomas to sign
        const letters: Letter[] = await db.letters.where({ lesson: lesson.id }).filter(letter => letter.valid).toArray();
        setCountOfValidLetters(dontSign ? 0 : letters.length);

        // // Get diplomas additional meta
        const genesisU8 = statics.api.genesisHash;
        const referee = currentPair;
        const refereeU8 = referee.publicKey;
        const refereePublicKeyHex = u8aToHex(refereeU8);
        const amount = new BN(lesson.dWarranty);

        for (const letterFromDB of letters) {
          // calculate letter number (nonce)
          let letterId = letterFromDB.letterNumber;
          if (letterFromDB.letterNumber < 0) {
            letterId = await getLastUnusedLetterNumber(refereePublicKeyHex);
            await setLastUsedLetterNumber(refereePublicKeyHex, letterId);
          }

          const workerPublicKeyU8 = hexToU8a(letterFromDB.worker);


          const privateData = dontSign ? "" : getPrivateDataToSignByReferee(letterFromDB.cid, genesisU8, letterId, diplomaBlockNumber, refereeU8, workerPublicKeyU8, amount);
          const receipt = dontSign ? "" : getPublicDataToSignByReferee(genesisU8, letterId, diplomaBlockNumber, refereeU8, workerPublicKeyU8, amount);
          const refereeSignOverPrivateData = dontSign ? "" : u8aToHex(currentPair.sign(u8aWrapBytes(privateData)));
          const refereeSignOverReceipt = dontSign ? "" : u8aToHex(currentPair.sign(u8aWrapBytes(receipt)));

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
        }
      } catch (error) {
        console.error(error);
      }
    };

    signLetters();

  }, [api, isApiReady, currentPair, lesson]);

  

  return (
    <FullWidthContainer>
      <StyledCloseButton onClick={onClose}
        icon='close'
      />
      <VerticalCenterItemsContainer>
        <CenterQRContainer>
          <h2>{t('Show to the student to send the results')}</h2>
          <QRWithShareAndCopy
            dataQR={diplomaText}
            titleShare={t('QR code')}
            textShare={t('Press the link to add the diploma')}
            urlShare={diplomaAddUrl}
            dataCopy={diplomaAddUrl} />
        </CenterQRContainer>
        <DiplomaDiv>
          <Card>
            <div className="table">
              <div className="row">
                <div className="cell"><Icon icon='graduation-cap' /></div>
                <div className="cell">{lessonName ? <KatexSpan content={lessonName} /> : ''}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='user' /></div>
                <div className="cell">{studentName}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='dollar' /></div>
                <div className="cell">{totalProfitForLetters.toString()} Slon - {t('lesson price')}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='shield' /></div>
                <div className="cell">{diplomaWarrantyInSlon.toString()} Slon - {t('warranty')}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='clock-rotate-left' /></div>
                <div className="cell">{lesson ? lesson.dValidity : '0'} {t('days valid')}</div>
              </div>
              <div className="row">
                <div className="cell"><Button icon='edit' onClick={toggleVisibleDiplomaDetails} /></div>
              </div>
            </div>
          </Card>
        </DiplomaDiv>
      </VerticalCenterItemsContainer>

      {visibleDiplomaDetails && <StyledModal
        className={className}
        header={totalProfitForLetters.toString() + ' Slon - ' + t('lesson price')}
        onClose={toggleVisibleDiplomaDetails}
        size='small'
      >
        <Modal.Content>
          <div className='ui--row'>
            <InputBalance
              isZeroable
              label={t('receive payment for each diploma')}
              onChange={setDiplomaPrice}
              defaultValue={lesson ? new BN(lesson.dPrice) : BN_ZERO}
            />
          </div>
          <div className='ui--row'>
            <InputBalance
              isZeroable
              label={t('stake for each diploma')}
              onChange={setAmount}
              defaultValue={lesson ? new BN(lesson.dWarranty) : BN_ZERO}
              isError={!lesson || new BN(lesson.dWarranty).eq(BN_ZERO)}
            />
          </div>
          <div className='ui--row'>
            <Input
              className='full'
              label={t('days valid')}
              onChange={setDaysValid}
              value={daysInputValue}
              placeholder={t('Positive number')}
              isError={!daysInputValue || daysInputValue === "0"}
            />
          </div>
        </Modal.Content>
      </StyledModal>}
    </FullWidthContainer>
  );
}

const DiplomaDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 100%;
  margin: 0 auto;
  @media (min-width: 360px) {
    width: 360px;
  }
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

export const StyledCloseButton = styled(Button)`
  position: absolute;
  width: 40px;
  top: 50px;
  right: 10px;
  z-index: 1;
`;
const StyledModal = styled(Modal)`
`;
export default React.memo(LessonResults);