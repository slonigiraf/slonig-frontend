// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import BN from 'bn.js';
import { statics } from '@polkadot/react-api/statics';
import { styled, Button, InputBalance } from '@polkadot/react-components';
import { useApi, useBlockTime, useToggle } from '@polkadot/react-hooks';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN_ONE, BN_ZERO, formatBalance } from '@polkadot/util';
import type { LessonResult } from '@slonigiraf/slonig-components';
import { useLoginContext, CenterQRContainer, bnToSlonString, SenderComponent, useInfo, nameFromKeyringPair, predictBlockNumber, FullscreenActivity, useLog, bnToSlonFloatOrNaN, useSettingValue } from '@slonigiraf/slonig-components';
import { Lesson, getLastUnusedLetterNumber, setLastUsedLetterNumber, getReexaminationsByLessonId, getValidLetterTemplatesByLessonId, SettingKey, serializeAsLetter, LetterTemplate, putLetterTemplate, setSettingToTrue, getLesson, getSetting, getToRepeatLetterTemplatesByLessonId } from '@slonigiraf/db';
import { getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { useTranslation } from '../translate.js';
import { blake2AsHex } from '@polkadot/util-crypto';
import { useLiveQuery } from 'dexie-react-hooks';
import LessonProcessInfo from './LessonProcessInfo.js';
import BadgeInfo from '../Assess/BadgeInfo.js';

interface Props {
  className?: string;
  lesson: Lesson | null;
  updateAndStoreLesson: (lesson: Lesson | null) => void;
  onClose: () => void;
  onFinished: () => void;
}

const divisor = new BN(100000000);
const multiplier = new BN(119921875);

function LessonResults({ className = '', lesson, updateAndStoreLesson, onClose, onFinished }: Props): React.ReactElement<Props> {
  // Initialize api, ipfs and translation
  const { api, isApiReady } = useApi();
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const paidLesson = useLiveQuery(() => lesson ? getLesson(lesson.id) : undefined, [lesson]);
  const validLetterTemplates = lesson ? useLiveQuery<LetterTemplate[]>(
    () => getValidLetterTemplatesByLessonId(lesson.id),
    [lesson]
  ) : [];

  const { currentPair } = useLoginContext();
  const tokenSymbol = formatBalance.findSi('-').text;
  const dontSign = lesson ? (lesson.dWarranty === '0' || lesson.dValidity === 0) : true;
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  //   student name
  const [priceInputValue, setPriceInputValue] = useState<BN>(lesson ? new BN(lesson.dPrice) : BN_ZERO);
  const [amountInputValue, setAmountInputValue] = useState<BN>(lesson ? new BN(lesson.dWarranty) : BN_ZERO);
  const [daysInput, setDaysInput] = useState<string>(lesson ? lesson.dValidity.toString() : "0"); //To allow empty strings
  const [countOfValidLetters, setCountOfValidLetters] = useState<number | null>(null);
  const [countOfRepetitions, setCountOfRepetitions] = useState<number | null>(null);
  const [countOfReexaminationsPerformed, setCountOfReexaminationsPerformed] = useState<number | null>(null);
  const totalIncomeRef = React.useRef<BN>(BN_ZERO);
  const [visibleDiplomaDetails, toggleVisibleDiplomaDetails] = useToggle(false);
  const [data, setData] = useState('');
  const [processingStatistics, setProcessingStatistics] = useState(true);
  const [processingQR, setProcessingQR] = useState(true);
  const [resultsWereSent, setResultsWereSent] = useState(false);
  const defaultWarranty = useSettingValue(SettingKey.DIPLOMA_WARRANTY);
  const defaultWarrantyBN = defaultWarranty ? new BN(defaultWarranty) : BN_ZERO;

  const { showInfo } = useInfo();

  useEffect(() => {
    if (countOfValidLetters !== null && countOfReexaminationsPerformed !== null && countOfRepetitions !== null) {
      setProcessingStatistics(false);
      if (countOfValidLetters + countOfReexaminationsPerformed + countOfRepetitions === 0) {
        if (dontSign) {
          showInfo(t('Go to ’Settings’ and press ’Reset settings to default’.'), 'error');
        } else {
          showInfo(t('You did not issue or reexamine any badges during this lesson.'));
        }
        onClose();
      }
    }
  }, [countOfValidLetters, countOfRepetitions, countOfReexaminationsPerformed, dontSign]);

  const onDataSent = useCallback(async (): Promise<void> => {
    logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_data_was_sent');
    setResultsWereSent(true);
    if (totalIncomeRef.current.isZero()) {
      onFinished();
    };
  }, [onFinished, setResultsWereSent]);

  useEffect(() => {
    const run = async () => {
      if (resultsWereSent && lesson && paidLesson
        && lesson.id === paidLesson.id
        && paidLesson.isPaid === true) {
        const dbTutorTutorialCompletedValue = await getSetting(SettingKey.TUTOR_TUTORIAL_COMPLETED);
        if (!dbTutorTutorialCompletedValue) {
          logEvent('ONBOARDING', 'TUTOR_TUTORIAL_COMPLETED');
          await setSettingToTrue(SettingKey.TUTOR_TUTORIAL_COMPLETED);
        }
        onFinished();
      }
    }
    run();
  }, [resultsWereSent, lesson, paidLesson, onFinished]);

  const setPriceInput = useCallback((value?: BN | undefined): void => {
    if (value) {
      setPriceInputValue(value);
      const calculatedAmount = value.divRound(divisor).mul(multiplier);
      setAmountInputValue(calculatedAmount.gt(defaultWarrantyBN) ? calculatedAmount : defaultWarrantyBN);
    }
  }, [setPriceInputValue, defaultWarrantyBN]);

  const isWrongDaysInput = !daysInput || !(parseInt(daysInput) > 0);
  const saveLessonSettings = useCallback(async (): Promise<void> => {
    const days = parseInt(daysInput, 10);

    if (!amountInputValue || amountInputValue.eq(BN_ZERO) || isWrongDaysInput) {
      showInfo(t('Correct the errors highlighted in red'), 'error');
    } else {
      if (lesson) {
        if (priceInputValue.toString() !== lesson.dPrice) {
          logEvent('SETTINGS', 'DIPLOMA_PRICE_SET', 'diploma_price_set_to_slon', bnToSlonFloatOrNaN(priceInputValue));
        }
        if (amountInputValue.toString() !== lesson.dWarranty) {
          logEvent('SETTINGS', 'DIPLOMA_WARRANTY_SET', 'diploma_warranty_set_to_slon', bnToSlonFloatOrNaN(amountInputValue))
        }
        if (days !== lesson.dValidity) {
          logEvent('SETTINGS', 'DIPLOMA_VALIDITY_SET', 'diploma_validity_set_to_days', days);
        }
        const updatedLesson = {
          ...lesson,
          dPrice: priceInputValue.toString(),
          dWarranty: amountInputValue.toString(),
          dValidity: days
        };
        updateAndStoreLesson(updatedLesson);
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
      let repetitionData: string[] = [];
      try {
        // Update reexaminations data
        const reexaminations = await getReexaminationsByLessonId(lesson.id);
        if (reexaminations) {
          let skippedReexaminationsCount = 0;
          const calculatedReexaminationsPerformed = lesson.reexamineStep - skippedReexaminationsCount;
          setCountOfReexaminationsPerformed(calculatedReexaminationsPerformed);
          reexaminations.forEach(reexamination => {
            if (reexamination.created !== reexamination.lastExamined) {
              reexaminationData.push(`${reexamination.pubSign},${reexamination.lastExamined},${reexamination.valid ? '1' : '0'}`);
            }
          });
        }
        // Update repetition data
        const repetitionTemplates = await getToRepeatLetterTemplatesByLessonId(lesson.id);
        repetitionData.push(...repetitionTemplates.map(t => `${t.lastExamined},${t.knowledgeId}`));
        setCountOfRepetitions(repetitionTemplates.length);

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
        totalIncomeRef.current = lessonPrice;

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
        const tutorIsExperienced = await getSetting(SettingKey.TUTOR_TUTORIAL_COMPLETED);
        const lessonResult: LessonResult = {
          agreement: agreement,
          price: lessonPrice.toString(),
          workerId: lesson.student,
          genesis: genesisU8.toHex(),
          referee: refereePublicKeyHex,
          refereeName: refereeName,
          amount: amount.toString(),
          tutorIsExperienced: tutorIsExperienced === 'true',
          letters: letterData,
          repetitions: repetitionData,
          reexaminations: reexaminationData,
        };

        if (letterData.length > 0) {
          logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_badges', letterData.length);
          logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_price_slon', bnToSlonFloatOrNaN(lessonPrice));
          logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_warranty_slon', bnToSlonFloatOrNaN(amount));
          logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_days_valid', lesson.dValidity);
        }
        if (repetitionData.length) {
          logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_repetitions', repetitionData.length);
        }
        if (reexaminationData.length) {
          logEvent('TUTORING', 'LESSON_RESULTS', 'lesson_reexaminations', reexaminationData.length);
        }

        setData(JSON.stringify(lessonResult));
      } catch (error) {
        console.error(error);
      }
    };

    signAndUpdateStatistics();

  }, [api, isApiReady, currentPair, lesson]);

  const cancelLetterTemplate = async (letterTemplate: LetterTemplate) => {
    await putLetterTemplate({ ...letterTemplate, valid: false, toRepeat: true });
  };

  const constContentIsVisible = !(processingStatistics || processingQR);

  return (
    <FullscreenActivity caption={t('Send results and get a reward')} onClose={onClose}>
      <CenterQRContainer>
        <SenderComponent data={data} route={'badges'} caption={t('Ask the tutee to scan:')}
          textShare={t('Press the link to add the badge')} onDataSent={onDataSent} onReady={() => setProcessingQR(false)} />
      </CenterQRContainer>
      {constContentIsVisible &&
        <>
          <StyledDiv>
            {lesson && <LessonProcessInfo lesson={lesson} showLastAction={false} />}
          </StyledDiv>
          <StyledDiv>
            <Button className='highlighted--button' icon='edit' label={t('Edit')} onClick={toggleVisibleDiplomaDetails} />
          </StyledDiv>
        </>
      }
      {visibleDiplomaDetails &&
        <FullscreenActivity caption={`${bnToSlonString(totalIncomeRef.current)} ${tokenSymbol} - ${t('reward')}`} onClose={saveLessonSettings}>
          <WarrantyAndDays>
            <label>{bnToSlonFloatOrNaN(amountInputValue) + ' Slon - ' + t('stake for each badge')}</label>
            <label>{lesson && lesson.dValidity.toString() + ' ' + t('days valid')}</label>
          </WarrantyAndDays>
          <InputDiv>
            <div className='ui--row'>
              <InputBalance
                isZeroable
                label={t('my reward per badge')}
                onChange={setPriceInput}
                defaultValue={lesson ? new BN(lesson.dPrice) : BN_ZERO}
              />
            </div>
          </InputDiv>
          {validLetterTemplates && validLetterTemplates.map((item: LetterTemplate) => (
            <LetterTemplateInfo key={item.cid}>
              <Button icon='trash-can' onClick={() => cancelLetterTemplate(item)} />
              <BadgeInfo badge={item} isSelected={false} onToggleSelection={() => { }} isSelectionAllowed={false} />
            </LetterTemplateInfo>
          ))}
        </FullscreenActivity>
      }
    </FullscreenActivity>
  );
}

const LetterTemplateInfo = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: left;
  align-items: center;
  width: 100%;
  padding-left: 10px;
  gap: 20px;
`;

const StyledDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 100%;
  margin-top: 10px;
`;
const InputDiv = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 85%;
`;

const WarrantyAndDays = styled.div`
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  padding-left: 75px;
`;
export default React.memo(LessonResults);

