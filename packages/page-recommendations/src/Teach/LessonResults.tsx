// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import BN from 'bn.js';
import { statics } from '@polkadot/react-api/statics';
import { styled, Button, Input, InputBalance, Modal } from '@polkadot/react-components';
import { useApi, useBlockTime, useToggle } from '@polkadot/react-hooks';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN_ONE, BN_ZERO, formatBalance } from '@polkadot/util';
import type { LessonResult } from '@slonigiraf/app-slonig-components';
import { useLoginContext, CenterQRContainer, balanceToSlonString, SenderComponent, useInfo, nameFromKeyringPair, predictBlockNumber, FullscreenActivity } from '@slonigiraf/app-slonig-components';
import { Lesson, getLastUnusedLetterNumber, setLastUsedLetterNumber, storeSetting, getReexaminationsByLessonId, getValidLetterTemplatesByLessonId, SettingKey, serializeAsLetter, LetterTemplate, putLetterTemplate, setSettingToTrue } from '@slonigiraf/db';
import { getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { useTranslation } from '../translate.js';
import { blake2AsHex } from '@polkadot/util-crypto';

interface Props {
  className?: string;
  lesson: Lesson | null;
  updateAndStoreLesson: (lesson: Lesson | null) => void;
  onClose: () => void;
  onFinished: () => void;
}

function LessonResults({ className = '', lesson, updateAndStoreLesson, onClose, onFinished }: Props): React.ReactElement<Props> {
  // Initialize api, ipfs and translation
  const { api, isApiReady } = useApi();
  const { t } = useTranslation();
  const { currentPair } = useLoginContext();
  const tokenSymbol = formatBalance.findSi('-').text;
  const dontSign = lesson ? (lesson.dWarranty === '0' || lesson.dValidity === 0) : true;
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  //   student name
  const [priceInputValue, setPriceInputValue] = useState<BN>(lesson ? new BN(lesson.dPrice) : BN_ZERO);
  const [amountInputValue, setAmountInputValue] = useState<BN>(lesson ? new BN(lesson.dWarranty) : BN_ZERO);
  const [daysInput, setDaysInput] = useState<string>(lesson ? lesson.dValidity.toString() : "0"); //To allow empty strings
  const [countOfValidLetters, setCountOfValidLetters] = useState<number | null>(null);
  const [countOfReexaminationsPerformed, setCountOfReexaminationsPerformed] = useState<number | null>(null);
  const [totalIncomeForLetters, setTotalIncomeForLetters] = useState<BN>(BN_ZERO);
  const [visibleDiplomaDetails, toggleVisibleDiplomaDetails] = useToggle(false);
  const [data, setData] = useState('');
  const [processingStatistics, setProcessingStatistics] = useState(true);
  const [processingQR, setProcessingQR] = useState(true);
  const { showInfo } = useInfo();

  useEffect(() => {
    if (countOfValidLetters !== null && countOfReexaminationsPerformed !== null) {
      setProcessingStatistics(false);
      if (countOfValidLetters + countOfReexaminationsPerformed === 0) {
        if (dontSign) {
          showInfo(t('Go to ’Settings’ and press ’Reset settings to default’.'), 'error');
        } else {
          showInfo(t('You did not issue or reexamine any badges during this lesson.'));
        }
        onClose();
      }
    }
  }, [countOfValidLetters, countOfReexaminationsPerformed, dontSign]);

  const onDataSent = useCallback(async (): Promise<void> => {
    await setSettingToTrue(SettingKey.TUTOR_TUTORIAL_COMPLETED);
    onFinished();
  }, [onClose]);

  const setAmountIput = useCallback((value?: BN | undefined): void => {
    if (value) {
      setAmountInputValue(value);
    }
  }, [setAmountInputValue]);

  const setPriceInput = useCallback((value?: BN | undefined): void => {
    if (value) {
      setPriceInputValue(value);
    }
  }, [setPriceInputValue]);

  const isWrongDaysInput = !daysInput || !(parseInt(daysInput) > 0);
  const saveLessonSettings = useCallback(async (): Promise<void> => {
    const days = parseInt(daysInput, 10);
    if (!amountInputValue || amountInputValue.eq(BN_ZERO) || isWrongDaysInput) {
      showInfo(t('Correct the errors highlighted in red'), 'error');
    } else {
      if (lesson) {
        const updatedLesson = {
          ...lesson,
          dPrice: priceInputValue.toString(),
          dWarranty: amountInputValue.toString(),
          dValidity: days
        };
        updateAndStoreLesson(updatedLesson);
        await Promise.all([
          storeSetting(SettingKey.DIPLOMA_PRICE, priceInputValue.toString()),
          storeSetting(SettingKey.DIPLOMA_WARRANTY, amountInputValue.toString()),
          storeSetting(SettingKey.DIPLOMA_VALIDITY, days.toString())
        ]);
      }
      toggleVisibleDiplomaDetails();
    }
  }, [priceInputValue, amountInputValue, daysInput, isWrongDaysInput, toggleVisibleDiplomaDetails, updateAndStoreLesson]);

  // Sign badge
  useEffect(() => {
    const signAndUpdateStatistics = async () => {
      if (!isApiReady || !currentPair || !lesson) {
        return;
      }
      let letterData: string[] = [];
      let reexaminationData: string[] = [];
      try {
        // Update reexaminations statistics
        const reexaminations = await getReexaminationsByLessonId(lesson.id);
        if (reexaminations) {
          let skippedReexaminationsCount = 0;
          const calculatedReexaminationsPerformed = lesson.reexamineStep - skippedReexaminationsCount;
          setCountOfReexaminationsPerformed(calculatedReexaminationsPerformed);
        }

        // Calculate block number
        const chainHeader = await api.rpc.chain.getHeader();
        const currentBlockNumber = new BN((chainHeader as { number: BN }).number.toString());
        const secondsValid = lesson.dValidity * 86400;

        const diplomaBlockNumber: BN = predictBlockNumber(currentBlockNumber, millisecondsPerBlock, secondsValid);

        // Get badges to sign
        const letterTemplates: LetterTemplate[] = await getValidLetterTemplatesByLessonId(lesson.id);
        const numberOfValidLetters = dontSign ? 0 : letterTemplates.length;
        const priceBN = lesson ? new BN(lesson.dPrice) : BN_ZERO;
        const lessonPrice = new BN(numberOfValidLetters).mul(priceBN);
        setCountOfValidLetters(numberOfValidLetters);
        setTotalIncomeForLetters(lessonPrice);

        // Get badges additional meta
        const genesisU8 = statics.api.genesisHash;
        const referee = currentPair;
        const refereeU8 = referee.publicKey;
        const refereePublicKeyHex = u8aToHex(refereeU8);
        const amount = new BN(lesson.dWarranty);

        for (const letterTemlateFromDB of letterTemplates) {
          // calculate letter number (nonce)
          let letterId = letterTemlateFromDB.letterId;
          if (letterTemlateFromDB.letterId < 0) {
            letterId = await getLastUnusedLetterNumber(refereePublicKeyHex);
            await setLastUsedLetterNumber(refereePublicKeyHex, letterId);
          }
          const workerPublicKeyU8 = hexToU8a(letterTemlateFromDB.worker);
          const privateData = dontSign ? "" : getPrivateDataToSignByReferee(letterTemlateFromDB.cid, genesisU8, letterId, diplomaBlockNumber, refereeU8, workerPublicKeyU8, amount);
          const receipt = dontSign ? "" : getPublicDataToSignByReferee(genesisU8, letterId, diplomaBlockNumber, refereeU8, workerPublicKeyU8, amount);
          const refereeSignOverPrivateData = dontSign ? "" : u8aToHex(currentPair.sign(u8aWrapBytes(privateData)));
          const refereeSignOverReceipt = dontSign ? "" : u8aToHex(currentPair.sign(u8aWrapBytes(receipt)));

          const updatedLetterTemplate: LetterTemplate = {
            ...letterTemlateFromDB,
            genesis: genesisU8.toHex(),
            letterId: letterId,
            block: diplomaBlockNumber.toString(),
            amount: amount.toString(),
            privSign: refereeSignOverPrivateData,
            pubSign: refereeSignOverReceipt,
          };
          await putLetterTemplate(updatedLetterTemplate);

          letterData.push(serializeAsLetter(updatedLetterTemplate, refereePublicKeyHex));
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
          reexaminations: reexaminationData,
        };
        setData(JSON.stringify(lessonResult));
      } catch (error) {
        console.error(error);
      }
    };

    signAndUpdateStatistics();

  }, [api, isApiReady, currentPair, lesson]);

  const constContentIsVisible = !(processingStatistics || processingQR);

  return (
    <FullscreenActivity caption={t('Send results and get a reward')} onClose={onClose}>
      <CenterQRContainer>
        <SenderComponent data={data} route={'badges'} caption={t('Ask the tutee to scan:')}
          textShare={t('Press the link to add the badge')} onDataSent={onDataSent} onReady={() => setProcessingQR(false)} />
      </CenterQRContainer>
      {constContentIsVisible &&
        <StyledDiv>
          <Button className='highlighted--button' icon='edit' label={t('Edit')} onClick={toggleVisibleDiplomaDetails} />
        </StyledDiv>
      }

      {visibleDiplomaDetails && <DetailsModal
        className={className}
        header={`${balanceToSlonString(totalIncomeForLetters)} ${tokenSymbol} - ${t('reward')}`}
        onClose={toggleVisibleDiplomaDetails}
        size='small'
      >
        <Modal.Content>
          <div className='ui--row'>
            <InputBalance
              isZeroable
              label={t('receive reward for each badge')}
              onChange={setPriceInput}
              defaultValue={lesson ? new BN(lesson.dPrice) : BN_ZERO}
            />
          </div>
          <div className='ui--row'>
            <InputBalance
              isZeroable
              label={t('stake for each badge')}
              onChange={setAmountIput}
              defaultValue={lesson ? new BN(lesson.dWarranty) : BN_ZERO}
              isError={amountInputValue.eq(BN_ZERO)}
            />
          </div>
          <div className='ui--row'>
            <Input
              className='full'
              label={t('days valid')}
              onChange={setDaysInput}
              defaultValue={lesson ? lesson.dValidity.toString() : "0"}
              placeholder={t('Positive number')}
              isError={isWrongDaysInput}
            />
          </div>
        </Modal.Content>
        <Modal.Actions>
          <Button
            className='highlighted--button'
            icon='save'
            label={t('Save and close')}
            onClick={saveLessonSettings}
          />
        </Modal.Actions>
      </DetailsModal>}
    </FullscreenActivity>
  );
}

const StyledDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 100%;
  margin: 0 auto;
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

