// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Icon, styled } from '@polkadot/react-components';
import React from 'react'
import { useTranslation } from '../translate.js';
import { LessonResult } from '@slonigiraf/slonig-components';


interface Props {
  className?: string;
  lessonResult: LessonResult;
}



function LessonProcessInfo({ className = '', lessonResult }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();


  const reexaminations = lessonResult.reexaminations
    .map(v => v.split(','))
    .map(([, , valid]) => valid === '1');

  const validReexaminations = reexaminations.filter(v => v).length;
  const canceledReexaminations = reexaminations.length - validReexaminations;

  return (

    <StyledDiv>
      <TotalStat>
        <h3>{t('After payment, you will receive')}</h3>
        <StatGrid>
          <Icon icon="shield" />
          <StatNumber>{validReexaminations}</StatNumber>
          <StatLabel>{t('Badges survived the reexamination')}</StatLabel>
        
          <Icon icon="shield-halved" />
          <StatNumber>{canceledReexaminations}</StatNumber>
          <StatLabel>{t('Canceled badges')}</StatLabel>
       
          <Icon icon="rotate" />
          <StatNumber>{lessonResult.repetitions.length}</StatNumber>
          <StatLabel>{t('Skills to repeat')}</StatLabel>
    
          <Icon icon="trophy" />
          <StatNumber>{lessonResult.letters.length}</StatNumber>
          <StatLabel>{t('New badges')}</StatLabel>
        </StatGrid>
      </TotalStat>
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const TotalStat = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  justify-content: center;
  h3 {
    margin-top: 10px;
  }
`;

const StatNumber = styled.span`
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`;

const StatLabel = styled.span`
  opacity: 0.9;
`;

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, max-content); /* each column shrinks to content */
  grid-auto-rows: auto;
  gap: 0.5rem 0.5rem; /* row gap / column gap */
  align-items: center;
  justify-content: start; /* keep it left-aligned */
`;



export default React.memo(LessonProcessInfo);