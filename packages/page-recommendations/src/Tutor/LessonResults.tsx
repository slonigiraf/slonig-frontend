// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import BN from 'bn.js';
import { statics } from '@polkadot/react-api/statics';
import { styled, Button, Input, InputBalance, Icon, Card, Modal, Spinner } from '@polkadot/react-components';
import { useApi, useBlockTime, useToggle } from '@polkadot/react-hooks';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN_ONE, BN_ZERO, formatBalance } from '@polkadot/util';
import type { LessonResult, Skill } from '@slonigiraf/app-slonig-components';
import { getIPFSDataFromContentID, parseJson, useIpfsContext, useLoginContext, VerticalCenterItemsContainer, CenterQRContainer, KatexSpan, balanceToSlonString, SenderComponent, useInfo, nameFromKeyringPair, StyledContentCloseButton } from '@slonigiraf/app-slonig-components';
import { getPseudonym, Lesson, Letter, getLastUnusedLetterNumber, setLastUsedLetterNumber, storeSetting, putLetter, getInsurancesByLessonId, getValidLettersByLessonId, QRAction, SettingKey, QRField, serializeLetter, deleteSetting } from '@slonigiraf/db';
import { getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { useTranslation } from '../translate.js';
import { blake2AsHex } from '@polkadot/util-crypto';

const getDiplomaBlockNumber = (currentBlock: BN, blockTimeMs: number, secondsToAdd: number): BN => {
  const secondsToGenerateBlock = blockTimeMs / 1000;
  const blocksToAdd = new BN(secondsToAdd).div(new BN(secondsToGenerateBlock));
  const blockAllowed = currentBlock.add(blocksToAdd);
  return blockAllowed;
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
  const tokenSymbol = formatBalance.findSi('-').text;
  const dontSign = lesson ? (lesson.dWarranty === '0' || lesson.dValidity === 0) : true;
  const [lessonName, setLessonName] = useState<string>('');
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  //   student name
  const [studentName, setStudentName] = useState<string | null>(null);
  const [daysInputValue, setDaysInputValue] = useState<string>(lesson ? lesson.dValidity.toString() : "0"); //To allow empty strings
  const [countOfValidLetters, setCountOfValidLetters] = useState<number | null>(null);
  const [countOfDiscussedInsurances, setCountOfDiscussedInsurances] = useState<number | null>(null);
  const [countOfInvalidInsurances, setCountOfInvalidInsurances] = useState<number | null>(null);
  const [totalIncomeForBonuses, setTotalIncomeForBonuses] = useState<BN>(BN_ZERO);
  const [diplomaWarrantyAmount, setDiplomaWarrantyAmount] = useState<BN>(BN_ZERO);
  const [totalIncomeForLetters, setTotalIncomeForLetters] = useState<BN>(BN_ZERO);
  const [visibleDiplomaDetails, toggleVisibleDiplomaDetails] = useToggle(false);
  const [data, setData] = useState('');
  const [processingStatistics, setProcessingStatistics] = useState(true);
  const [processingQR, setProcessingQR] = useState(true);
  const { showInfo } = useInfo();

  useEffect(() => {
    if (countOfValidLetters !== null && countOfDiscussedInsurances !== null) {
      setProcessingStatistics(false);
      if (countOfValidLetters + countOfDiscussedInsurances === 0) {
        showInfo(t('You did not issue or reexamine any diplomas during this lesson.'));
        onClose();
      }
    }
  }, [countOfValidLetters, countOfDiscussedInsurances]);

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
      let letterData: string[] = [];
      let insuranceData: string[] = [];
      try {
        // Update insurances statistics
        const insurances = await getInsurancesByLessonId(lesson.id);
        if (insurances) {
          let invalidInsurancesCount = 0;
          let skippedInsurancesCount = 0;
          let totalBonusAmount = new BN(0);

          // Single loop to calculate all statistics
          insurances.forEach(insurance => {
            if (!insurance.valid) {
              invalidInsurancesCount++;
              totalBonusAmount = totalBonusAmount.add(new BN(insurance.amount));
            }
            if (insurance.created === insurance.lastExamined) {
              skippedInsurancesCount++;
            } else {
              insuranceData.push(`${insurance.signOverReceipt},${insurance.lastExamined},${insurance.valid ? '1' : '0'}`);
            }
          });

          const calculatedDiscussedInsurances = lesson.reexamineStep - skippedInsurancesCount;

          setCountOfInvalidInsurances(invalidInsurancesCount);
          setTotalIncomeForBonuses(totalBonusAmount);
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
            genesis: genesisU8.toHex(),
            letterNumber: letterId,
            block: diplomaBlockNumber.toString(),
            referee: refereePublicKeyHex,
            amount: amount.toString(),
            signOverPrivateData: refereeSignOverPrivateData,
            signOverReceipt: refereeSignOverReceipt,
          };
          await putLetter(updatedLetter);

          letterData.push(serializeLetter(updatedLetter));
        }

        const agreement = blake2AsHex(JSON.stringify(lesson));
        const refereeName = nameFromKeyringPair(currentPair);
        const lessonResult: LessonResult = {
          agreement: agreement,
          price: lessonPrice.toString(),
          workerId: lesson.student,
          genesis: genesisU8.toHex(),
          referee: refereePublicKeyHex,
          refereeName: refereeName,
          amount: amount.toString(),
          letters: letterData,
          insurances: insuranceData,
        };
        setData(JSON.stringify(lessonResult));
      } catch (error) {
        console.error(error);
      }
    };

    signAndUpdateStatistics();

  }, [api, isApiReady, currentPair, lesson]);

  const [action] = useState({ [QRField.QR_ACTION]: QRAction.ADD_DIPLOMA });

  const constContentIsVisible = !(processingStatistics || processingQR);

  return (
    <>
      <StyledContentCloseButton onClick={onClose}
        icon='close'
      />
      <VerticalCenterItemsContainer>
        {!constContentIsVisible && <Spinner />}
        <CenterQRContainer>
          {constContentIsVisible && <h2>{t('Show to the student')}</h2>}
          <SenderComponent data={data} route={'diplomas'} action={action}
            textShare={t('Press the link to add the diploma')} onDataSent={onClose} onReady={() => setProcessingQR(false)} />
        </CenterQRContainer>
        {constContentIsVisible &&
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
                  <div className="cell">{balanceToSlonString(totalIncomeForBonuses)} {tokenSymbol} - {t('bonuses will be received')}</div>
                </div>
                <div className="row">
                  <div className="cell">
                    <Button icon='edit' label={t('Edit')} onClick={toggleVisibleDiplomaDetails} />
                    <Button icon='close' label={t('Close')} onClick={onClose} />
                  </div>
                </div>
              </div>
            </Card>
          </DiplomaDiv>
        }
      </VerticalCenterItemsContainer>

      {visibleDiplomaDetails && <DetailsModal
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
        <Modal.Actions>
          <Button
            icon='save'
            label={t('Save and close')}
            onClick={toggleVisibleDiplomaDetails}
          />
        </Modal.Actions>
      </DetailsModal>}
    </>
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

const DetailsModal = styled(Modal)`
  button[data-testid='close-modal'] {
    opacity: 0;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  button[data-testid='close-modal']:focus {
    outline: none;
  }
`;
export default React.memo(LessonResults);

