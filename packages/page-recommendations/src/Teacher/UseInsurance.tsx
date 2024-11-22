// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useState } from 'react';
import { Button, InputAddress } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { useTranslation } from '../translate.js';
import { addReimbursement, cancelInsurance, Insurance, insuranceToReimbursement } from '@slonigiraf/db';
import { useBlockchainSync, useInfo, useLoginContext } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  insurance: Insurance;
}

function UseInsurance({ className = '', insurance }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { currentPair } = useLoginContext();
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const { showInfo } = useInfo();
  const { reimburse } = useBlockchainSync();

  const processBounty = async () => {
    setIsButtonClicked(true);
    if (currentPair !== null) {
      const reimbursement = insuranceToReimbursement(insurance);
      await addReimbursement(reimbursement);
      await cancelInsurance(insurance.workerSign, (new Date).getTime());
      reimburse([reimbursement]);
      showInfo(t('The bounty will be received'));
    }
  };

  return (
    <>
      {currentPair != null && <Button onClick={() => processBounty()}
        icon='dollar'
        label={t('Get bounty')}
        isDisabled={isButtonClicked}
      />}
    </>
  );
}

export default React.memo(UseInsurance);