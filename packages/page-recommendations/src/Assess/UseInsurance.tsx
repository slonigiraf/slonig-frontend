// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { CustomSVGIcon } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { addReimbursement, cancelInsurance, Insurance, insuranceToReimbursement } from '@slonigiraf/db';
import { bnToSlonFloatOrNaN, slonSVG, SVGButton, useBlockchainSync, useInfo, useLog, useLoginContext } from '@slonigiraf/slonig-components';
import BN from 'bn.js';
interface Props {
  className?: string;
  insurance: Insurance;
}

function UseInsurance({ className = '', insurance }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { currentPair } = useLoginContext();
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const { showInfo } = useInfo();
  const { logEvent } = useLog();
  const { reimburse } = useBlockchainSync();

  const processBounty = async () => {
    setIsButtonClicked(true);
    if (currentPair !== null) {
      logEvent('ASSESSMENT', 'ASSESSMENT_PENALIZE', 'assessment_penalize_by_slon', bnToSlonFloatOrNaN(new BN(insurance.amount)));
      const reimbursement = insuranceToReimbursement(insurance);
      await addReimbursement(reimbursement);
      await cancelInsurance(insurance.workerSign, (new Date).getTime());
      reimburse([reimbursement]);
      showInfo(t('The bounty will be received'));
    }
  };

  return (
    <>
      {currentPair != null && <SVGButton onClick={() => processBounty()}
        svg={<CustomSVGIcon svg={slonSVG} />}
        label={t('Get bounty')}
        isDisabled={isButtonClicked}
      />}
    </>
  );
}

export default React.memo(UseInsurance);