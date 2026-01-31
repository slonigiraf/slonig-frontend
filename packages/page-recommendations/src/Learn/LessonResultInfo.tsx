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
        <StatElement><Icon icon={'shield'} />&nbsp;{validReexaminations}&nbsp;&nbsp;&nbsp;{t('Badges survived the reexamination')}</StatElement>
        <StatElement><Icon icon={'shield-halved'} />&nbsp;{canceledReexaminations}&nbsp;&nbsp;&nbsp;{t('Canceled badges')}</StatElement>
        <StatElement><Icon icon={'rotate'} />&nbsp;{lessonResult.repetitions.length}&nbsp;&nbsp;&nbsp;{t('Skills to repeat')}</StatElement>
        <StatElement><Icon icon={'trophy'} />&nbsp;{lessonResult.letters.length}&nbsp;&nbsp;&nbsp;{t('New badges')}</StatElement>
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

const StatElement = styled.div`
  display: flex;
  justify-content: left;
  margin-top: 5px;
`;

export default React.memo(LessonProcessInfo);