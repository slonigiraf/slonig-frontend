// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { styled } from '@polkadot/react-components';
import React from 'react'
import { useTranslation } from '../translate.js';
import { LessonStat } from '../types.js';

interface Props {
  className?: string;
  lessonStat: LessonStat | null;
}

function LessonProcessInfo({ className = '', lessonStat }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();


  return (
    <StyledDiv>
      <h1>Statistics</h1>

    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

export default React.memo(LessonProcessInfo);