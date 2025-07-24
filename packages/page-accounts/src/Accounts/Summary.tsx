// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AccountBalance } from '../types.js';

import React from 'react';

import { CardSummary, styled } from '@polkadot/react-components';
import { FormatBalance } from '@polkadot/react-query';

import { useTranslation } from '../translate.js';

interface Props {
  className?: string;
  balance?: AccountBalance;
}

function Summary ({ balance, className }: Props) {
  const { t } = useTranslation();

  return (
    <StyledDiv className={className}>
      <CardSummary label={t('total balance')}>
        <FormatBalance
          className='prompt'
          value={balance?.total || 1}
        />
      </CardSummary>
    </StyledDiv>
  );
}
const StyledDiv = styled.div`
  align-items: stretch;
  display: flex;
  flex-wrap: no-wrap;
  justify-content: right;
`;
export default React.memo(Summary);
