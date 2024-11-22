// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useState } from 'react';
import { Button, InputAddress } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { useTranslation } from '../translate.js';
import { addReimbursement, deleteInsurance, Insurance, insuranceToReimbursement } from '@slonigiraf/db';
import { useBlockchainSync, useInfo } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  insurance: Insurance;
}

function UseInsurance({ className = '', insurance }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const { api } = useApi();
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const { showInfo } = useInfo();
  const { reimburse } = useBlockchainSync();

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const isUsable = currentPair != null;

  const processBounty = async () => {
    setIsButtonClicked(true);
    if (currentPair !== null) {
      const reimbursement = insuranceToReimbursement(insurance);
      await addReimbursement(reimbursement);
      await deleteInsurance(insurance.workerSign);
      reimburse([reimbursement]);
      showInfo(t('The bounty will be received'));
    }
  };

  return (
    <div className={`toolbox--Sign ${className}`}>
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          isInput={false}
          label={t('account')}
          onChange={_onChangeAccount}
          type='account'
        />
      </div>
      <div className='ui--row'>
        {isUsable && <Button onClick={() => processBounty()}
          icon='dollar'
          label={t('Get bounty')}
          isDisabled={isButtonClicked}
        />}
      </div>
    </div >
  );
}

export default React.memo(UseInsurance);