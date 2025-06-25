// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import BN from 'bn.js';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN_ONE } from '@polkadot/util';
import { nameFromKeyringPair, SenderComponent, CenterQRContainer, InsurancesTransfer, predictBlockNumber, useInfo } from '@slonigiraf/app-slonig-components';
import { useTranslation } from '../translate.js';
import { insuranceToUsageRight, Letter, putUsageRight, getInsuranceDaysValid, SettingKey, storeSetting, letterToInsurance, serializeInsurance, UsageRight } from '@slonigiraf/db';
import { keyForCid } from '@slonigiraf/app-slonig-components';
import { EditableInfo, Spinner } from '@polkadot/react-components';
import { useApi, useBlockTime } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  letters: Letter[];
  worker: string;
  employer: string;
  currentPair: KeyringPair;
  onDataSent: () => void;
}
function SignLettersUseRight({ className = '', letters, worker, employer, currentPair, onDataSent }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const [data, setData] = useState('');
  const { api, isApiReady } = useApi();
  const [daysInputValue, setDaysInputValue] = useState<string>(''); //To allow empty strings
  const usageRightsRef = useRef<UsageRight[]>([]);
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    getInsuranceDaysValid().then(value => {
      if (value) {
        setDaysInputValue(value.toString());
      }
    });
  }, []);

  useEffect(
    () => {
      const _onSign =
        async () => {
          if (!currentPair || !api || !isApiReady) {
            return;
          }
          const daysValid = parseInt(daysInputValue, 10);
          if (daysValid > 0) {
            const now = (new Date()).getTime();
            // Calculate block number
            const chainHeader = await api.rpc.chain.getHeader();
            const currentBlockNumber = new BN((chainHeader as { number: BN }).number.toString());
            const secondsValid = daysValid * 86400;
            const predictedBlock: BN = predictBlockNumber(currentBlockNumber, millisecondsPerBlock, secondsValid);

            let insurancePromises = letters.map(async letter => {
              const block = new BN(letter.block);
              const blockAllowed = block.gt(predictedBlock) ? predictedBlock : block;
              // generate a data to sign      
              const letterInsurance = getDataToSignByWorker(letter.letterId, block, blockAllowed, hexToU8a(letter.referee),
                hexToU8a(letter.worker), new BN(letter.amount), hexToU8a(letter.pubSign), hexToU8a(employer));

              const diplomaKey = keyForCid(currentPair, letter.cid);
              const workerSignOverInsurance = u8aToHex(diplomaKey.sign(u8aWrapBytes(letterInsurance)));
              return letterToInsurance(letter, employer, workerSignOverInsurance, blockAllowed.toString(), now);
            });

            const insurances = await Promise.all(insurancePromises);
            usageRightsRef.current = insurances.map(insuranceToUsageRight);

            const studentName = nameFromKeyringPair(currentPair);

            const preparedData: InsurancesTransfer = {
              identity: worker,
              name: studentName,
              insurances: insurances.map(serializeInsurance),
              employer: employer,
            };
            setData(JSON.stringify(preparedData));
          }
        };

      _onSign();
    }, [api, isApiReady, millisecondsPerBlock, currentPair, worker, employer, letters, daysInputValue]
  );

  const thereAreDiplomas = letters.length > 0;

  const setDaysValid = useCallback(
    (value: string) => {
      setDaysInputValue(value);
      if (value === "") return;
      const days = parseInt(value, 10);
      if (!isNaN(days) && days >= 0) {
        storeSetting(SettingKey.INSURANCE_VALIDITY, days.toString());
      }
    },
    []
  );

  const _onDataSent = () => {
    usageRightsRef.current.forEach(putUsageRight);
    showInfo(t('Sent'));
    onDataSent();
  }

  const validDays = daysInputValue && daysInputValue !== "0";
  const canShowHeader = isReady && validDays;

  return (
    <CenterQRContainer>
      {canShowHeader && <h2 style={{ marginTop: '0px' }}>{t('Show to get a bonus')}</h2>}
      <SenderComponent
        onDataSent={_onDataSent}
        data={data}
        route={'badges/assess'}
        textShare={t('Press the link to see badges of the student')}
        isDisabled={!thereAreDiplomas || !validDays} onReady={() => setIsReady(true)} />
      {isReady && <EditableInfo
        label={t('days valid')}
        onChange={setDaysValid}
        value={daysInputValue}
        placeholder={t('Positive number')}
        isError={!validDays}
      />}
    </CenterQRContainer>
  );

}

export default React.memo(SignLettersUseRight);