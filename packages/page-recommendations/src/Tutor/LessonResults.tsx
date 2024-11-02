// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import BN from 'bn.js';
import { statics } from '@polkadot/react-api/statics';
import { styled, Button, Input, InputBalance, Icon, Card, Modal } from '@polkadot/react-components';
import { useApi, useBlockTime, useToggle } from '@polkadot/react-hooks';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN_ONE, BN_ZERO, formatBalance } from '@polkadot/util';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { QRWithShareAndCopy, getBaseUrl, getIPFSDataFromContentID, parseJson, useIpfsContext, useLoginContext, FullWidthContainer, VerticalCenterItemsContainer, CenterQRContainer, KatexSpan, useInfo, balanceToSlonString, signStringArray, verifySignature, SenderComponent } from '@slonigiraf/app-slonig-components';
import { Insurance, getPseudonym, Lesson, Letter, getLastUnusedLetterNumber, setLastUsedLetterNumber, storeSetting, updateLetter, getInsurancesByLessonId, getValidLettersByLessonId, QRAction, SettingKey, QRField, getDataShortKey } from '@slonigiraf/db';
import { getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { useTranslation } from '../translate.js';
import type { KeyringPair } from '@polkadot/keyring/types';

const getDiplomaBlockNumber = (currentBlock: BN, blockTimeMs: number, secondsToAdd: number): BN => {
  const secondsToGenerateBlock = blockTimeMs / 1000;
  const blocksToAdd = new BN(secondsToAdd).div(new BN(secondsToGenerateBlock));
  const blockAllowed = currentBlock.add(blocksToAdd);
  return blockAllowed;
}

function letterAsArray(letter: Letter, insurance: Insurance | null) {
  let result: string[] = [];
  result.push(letter.cid);                      // Skill CID
  result.push(letter.workerId);                 // Student Identity
  result.push(letter.genesis);                  // Genesis U8 Hex
  result.push(letter.letterNumber.toString());             // Letter ID
  result.push(letter.block);                    // Diploma Block Number
  result.push(letter.referee);                  // Referee Public Key Hex
  result.push(letter.worker);                   // Student
  result.push(letter.amount);                   // Amount
  result.push(letter.signOverPrivateData);      // Referee Sign Over Private Data
  result.push(letter.signOverReceipt);          // Referee Sign Over Receipt
  if(insurance){
    result.push(insurance.signOverReceipt);
    result.push(insurance.wasUsed? '0' : '1');
  }
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
  const { t } = useTranslation();
  const { currentPair } = useLoginContext();
  const now = (new Date()).getTime();
  const tokenSymbol = formatBalance.findSi('-').text;
  const dontSign = lesson ? (lesson.dWarranty === '0' || lesson.dValidity === 0) : true;
  const [lessonName, setLessonName] = useState<string>('');
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  const [daysInputValue, setDaysInputValue] = useState<string>(lesson ? lesson.dValidity.toString() : "0"); //To allow empty strings
  const [countOfValidLetters, setCountOfValidLetters] = useState(0);
  const [countOfDiscussedInsurances, setCountOfDiscussedInsurances] = useState(0);
  const [countOfReceivingBonuses, setCountOfReceivingBonuses] = useState(0);
  const [countOfInvalidInsurances, setCountOfInvalidInsurances] = useState(0);
  const [totalIncomeForBonuses, setTotalIncomeForBonuses] = useState<BN>(BN_ZERO);
  const [diplomaWarrantyAmount, setDiplomaWarrantyAmount] = useState<BN>(BN_ZERO);
  const [totalIncomeForLetters, setTotalIncomeForLetters] = useState<BN>(BN_ZERO);
  const [visibleDiplomaDetails, toggleVisibleDiplomaDetails] = useToggle(false);

  const [route, setRoute] = useState('');
  const [data, setData] = useState('');


  const createResultsQR = useCallback((letters: Letter[], insurances: Insurance[], lessonPrice: BN, keyPair: KeyringPair) => {
    
  }, []);

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
        setDiplomaWarrantyAmount(lesson ? new BN(lesson.dWarranty) : BN_ZERO);
      }
    }
    updateWarrantyInSlon()
  }, [lesson?.dWarranty])


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

  // Sign diploma
  useEffect(() => {
    const signAndUpdateStatistics = async () => {
      if (!isApiReady || !currentPair || !lesson) {
        return;
      }
      try {
        // Update insurances statistics
        const insurances = await getInsurancesByLessonId(lesson.id);
        if (insurances) {
          const usedInsurances = insurances.filter(insurance => insurance.wasUsed);
          const invalidInsurances = insurances.filter(insurance => !insurance.valid);
          const calculatedDiscussedInsurances = lesson.reexamineStep - insurances.filter(insurance => insurance.wasSkipped).length;

          const countOfBonuses = usedInsurances.length;
          const amountOfBonuses = usedInsurances.reduce(
            (sum, insurance) => sum.add(new BN(insurance.amount)),
            new BN(0)
          );
          setCountOfInvalidInsurances(invalidInsurances.length);
          setCountOfReceivingBonuses(countOfBonuses);
          setTotalIncomeForBonuses(amountOfBonuses);
          setCountOfDiscussedInsurances(calculatedDiscussedInsurances);
        }
        // Calculate block number
        const chainHeader = await api.rpc.chain.getHeader();
        const currentBlockNumber = new BN(chainHeader.number.toString());
        const secondsValid = lesson.dValidity * 86400;

        const diplomaBlockNumber: BN = getDiplomaBlockNumber(currentBlockNumber, millisecondsPerBlock, secondsValid);

        // Get diplomas to sign
        const letters: Letter[] = await getValidLettersByLessonId(lesson.id);
        const numberOfValidLetters = dontSign ? 0 : letters.length;
        const priceBN = lesson ? new BN(lesson.dPrice) : BN_ZERO;
        const lessonPrice = new BN(numberOfValidLetters).mul(priceBN);
        setCountOfValidLetters(numberOfValidLetters);
        setTotalIncomeForLetters(lessonPrice);

        // Get diplomas additional meta
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
        // TODO create 

        createResultsQR(letters, insurances, lessonPrice, currentPair);

      } catch (error) {
        console.error(error);
      }
    };

    signAndUpdateStatistics();

  }, [api, isApiReady, currentPair, lesson]);

  return (
    <FullWidthContainer>
      <StyledCloseButton onClick={onClose}
        icon='close'
      />
      <VerticalCenterItemsContainer>
        <CenterQRContainer>
          <h2>{t('Show to the student to send the results')}</h2>
          <SenderComponent data={data} route={route} action={{[QRField.QR_ACTION] : QRAction.ADD_DIPLOMA}} 
          textShare={t('Press the link to add the diploma')} />
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
                <div className="cell">{balanceToSlonString(totalIncomeForLetters)} {tokenSymbol} - {t('lesson price')}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='trophy' /></div>
                <div className="cell">{countOfValidLetters} {t('diplomas prepared')}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='shield' /></div>
                <div className="cell">{balanceToSlonString(diplomaWarrantyAmount)} {tokenSymbol} - {t('warranty')}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='clock-rotate-left' /></div>
                <div className="cell">{lesson ? lesson.dValidity : '0'} {t('days valid')}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='ban' /></div>
                <div className="cell">{countOfInvalidInsurances} {t('of')} {countOfDiscussedInsurances} {t('diplomas invalidated')}</div>
              </div>
              <div className="row">
                <div className="cell"><Icon icon='money-bill-trend-up' /></div>
                <div className="cell">{balanceToSlonString(totalIncomeForBonuses)} {tokenSymbol} - {t('bonuses received')}</div>
              </div>
              <div className="row">
                <div className="cell"><Button icon='edit' label={t('Edit')} onClick={toggleVisibleDiplomaDetails} /></div>
              </div>
            </div>
          </Card>
        </DiplomaDiv>
      </VerticalCenterItemsContainer>

      {visibleDiplomaDetails && <StyledModal
        className={className}
        header={`${balanceToSlonString(totalIncomeForLetters)} ${tokenSymbol} - ${t('lesson price')}`}
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

