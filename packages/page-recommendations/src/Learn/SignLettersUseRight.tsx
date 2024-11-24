// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import BN from 'bn.js';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useState } from 'react';
import { u8aToHex, hexToU8a, u8aWrapBytes, BN, BN_ONE } from '@polkadot/util';
import { nameFromKeyringPair, SenderComponent, CenterQRContainer, InsurancesTransfer, predictBlockNumber, useInfo } from '@slonigiraf/app-slonig-components';
import { useTranslation } from '../translate.js';
import { QRAction, insuranceToUsageRight, Letter, QRField, putUsageRight, getInsuranceDaysValid, SettingKey, storeSetting, letterToInsurance, serializeInsurance, UsageRight } from '@slonigiraf/db';
import { keyForCid } from '@slonigiraf/app-slonig-components';
import { Input } from '@polkadot/react-components';
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
  const [usageRights, setUsageRights] = useState<UsageRight[]>([]);
  const [millisecondsPerBlock,] = useBlockTime(BN_ONE, api);

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
              const letterInsurance = getDataToSignByWorker(letter.letterNumber, block, blockAllowed, hexToU8a(letter.referee),
                hexToU8a(letter.worker), new BN(letter.amount), hexToU8a(letter.signOverReceipt), hexToU8a(employer));

              const diplomaKey = keyForCid(currentPair, letter.cid);
              const workerSignOverInsurance = u8aToHex(diplomaKey.sign(u8aWrapBytes(letterInsurance)));
              return letterToInsurance(letter, employer, workerSignOverInsurance, blockAllowed.toString(), now);
            });

            const insurances = await Promise.all(insurancePromises);
            setUsageRights(insurances.map(insuranceToUsageRight));
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

  const [action] = useState({ [QRField.QR_ACTION]: QRAction.BUY_DIPLOMAS });

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

  const _onDataSent = useCallback(() => {
    usageRights.forEach(putUsageRight);
    showInfo(t('Sent'));
    onDataSent();
  }, [usageRights])

  const validDays = daysInputValue && daysInputValue !== "0";

  return (
    <CenterQRContainer>
      {validDays && <SenderComponent
        onDataSent={_onDataSent}
        data={data}
        route={'diplomas/assess'}
        action={action}
        textShare={t('Press the link to see diplomas of the student')}
        isDisabled={!thereAreDiplomas} />}
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
    </CenterQRContainer>
  );

}

export default React.memo(SignLettersUseRight);