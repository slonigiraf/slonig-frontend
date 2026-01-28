// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Icon, styled } from '@polkadot/react-components';
import React from 'react'
import { useTranslation } from '../translate.js';

function TooFastWarning(): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (
    <StyledDiv>
      <IconDiv><Icon icon={'ban'} /></IconDiv>
      <LastAction>
        <span>{t('It seems like you’re not following the hints. Please teach more slowly and follow all hints carefully.')}</span>
      </LastAction>
      

    </StyledDiv>
  );
}

const IconDiv = styled.div`
  margin: 5px;  
  width: 100%;
  font-size: 1.5em;
  text-align: center;
  color: red;
`;

const LastAction = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
`;

const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

export default React.memo(TooFastWarning);