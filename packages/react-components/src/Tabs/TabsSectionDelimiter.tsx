// Copyright 2017-2023 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';

import { styled } from '../styled.js';

interface TabsSectionDelimiterProps {
  className?: string;
}

function TabsSectionDelimiter ({ className = '' }: TabsSectionDelimiterProps): React.ReactElement {
  return (
    <StyledDiv />
  );
}

const StyledDiv = styled.div`
  width: 20px;
`;

export default React.memo(TabsSectionDelimiter);
