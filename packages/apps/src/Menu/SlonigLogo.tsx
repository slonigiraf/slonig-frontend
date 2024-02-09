// Copyright 2017-2024 @slonigiraf/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { styled } from '@polkadot/react-components';

function SlonigLogo (): React.ReactElement {
  return (
    <StyledDiv>
      Slonig
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  background: transparent;
  font-size: var(--font-size-h1);
  
`;

export default React.memo(SlonigLogo);
