// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Icon, styled } from '@polkadot/react-components';
import React from 'react'
import { useTranslation } from '../translate.js';
import { LessonStat } from '../types.js';
import { bnToSlonFloatOrNaN } from '@slonigiraf/slonig-components';
import BN from 'bn.js';
import { TutorAction } from '@slonigiraf/db';
import type { IconName } from '@fortawesome/fontawesome-svg-core';

interface Props {
  className?: string;
  lessonStat: LessonStat;
  showLastAction?: boolean;
}

  interface ActionInfo {
    icon: IconName | undefined;
    comment: string;
  }

function LessonProcessInfo({ className = '', lessonStat, showLastAction = true }: Props): React.ReactElement<Props> {
  if (!lessonStat) return <></>;
  const { t } = useTranslation();
  const lastAction = lessonStat.lastAction;
  const lastBonus = lessonStat.lastBonus;

  const actionToInfo = new Map<TutorAction, ActionInfo>([
    ['skip', { icon: 'forward', comment: t('You’ve skipped.') }],

    ['validate', { icon: 'shield', comment: t('You’ve validated a badge issued by another tutor.') }],
    ['revoke', { icon: 'shield-halved', comment: t('You’ve canceled the badge because the student forgot the skill.') }],

    ['mark_mastered_warm_up', { icon: undefined, comment: '' }],
    ['mark_for_repeat_warm_up', { icon: undefined, comment: '' }],

    ['mark_mastered_crude', { icon: 'rotate', comment: t('This was the student’s first time learning the skill, so it was marked for repetition.') }],
    ['mark_for_repeat_crude', { icon: 'rotate', comment: t('You’ve taught the skill and marked it for repetition to ensure the student remembers it.') }],

    ['mark_mastered_mature', { icon: 'award', comment: t('You’ve prepared a badge to your student.') }],
    ['mark_for_repeat_mature', { icon: 'rotate', comment: t('You were unsure the student would remember the skill, so it was marked for repetition.') }],
  ]);

  const getActionInfo = (action: TutorAction): ActionInfo => {
    return (action ? actionToInfo.get(action) : undefined) ?? { icon: undefined, comment: '' };
  }

  const { icon, comment } = getActionInfo(lessonStat.lastAction);

  const lastEarning = lastBonus ? lastBonus :
    (lastAction === 'mark_mastered_mature' || lastAction === 'mark_mastered_warm_up') ? bnToSlonFloatOrNaN(new BN(lessonStat.dPrice)) : 0;

  const warrantyAmount = (lastAction === 'mark_mastered_mature' || lastAction === 'mark_mastered_warm_up') ? bnToSlonFloatOrNaN(new BN(lessonStat.dWarranty)) : 0;

  const earningCommentOnBadge = (lastAction === 'mark_mastered_mature' || lastAction === 'mark_mastered_warm_up') ? t('You’ve earned {{amount}} Slon.', { replace: { amount: lastEarning, warranty: warrantyAmount } }) : '';
  const earningCommentOnRevoke = (lastAction === 'revoke') ? t('You’ve got {{amount}} Slon from a bad tutor.', { replace: { amount: lastEarning } }) : '';

  const lastEarningComment = earningCommentOnBadge || earningCommentOnRevoke || t('You haven’t earned Slon.');

  return (
    <StyledDiv>
      {showLastAction && <>
        {icon && <IconDiv><div><Icon icon={icon} /> + 1</div> <div>Slon + {lastEarning}</div></IconDiv>}
        <LastAction>
          <span>{comment}&nbsp;{lastEarningComment}</span>
        </LastAction>
      </>}
      <TotalStat>
        <StatElement><Icon icon={'shield'} />&nbsp;{lessonStat?.validatedBadgesCount}</StatElement>
        <StatElement><Icon icon={'shield-halved'} />&nbsp;{lessonStat?.revokedBadgesCount}</StatElement>
        <StatElement><Icon icon={'rotate'} />&nbsp;{lessonStat?.markedForRepeatCount}</StatElement>
        <StatElement><Icon icon={'award'} />&nbsp;{lessonStat?.issuedBadgeCount}</StatElement>
      </TotalStat>
      <TotalStat>
        <StatElement>{t('Total profit')}:&nbsp;{lessonStat?.totalProfit}&nbsp;Slon</StatElement>
        <StatElement>{t('I may lose')}:&nbsp;{lessonStat?.totalWarranty}&nbsp;Slon</StatElement>
      </TotalStat>

    </StyledDiv>
  );
}

const IconDiv = styled.div`
  display: flex;
  margin: 5px;  
  width: 100%;
  font-size: 1.5em;
  text-align: center;
  justify-content: center;
  color: #F39200;
  gap: 20px;
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

const TotalStat = styled.div`
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
`;

const StatElement = styled.div`
  display: flex;
  justify-content: left;
  margin-top: 5px;
  margin-left: 20px;
  color: rgb(0 0 0 / 25%);
`;

export default React.memo(LessonProcessInfo);