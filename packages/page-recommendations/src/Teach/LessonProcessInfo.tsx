// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Icon, styled } from '@polkadot/react-components';
import React, { useEffect, useState } from 'react'
import { useTranslation } from '../translate.js';
import { LessonStat } from '../types.js';
import { getLetterTemplatesByLessonId, getReexaminationsByLessonId, getToRepeatLetterTemplatesByLessonId, getValidLetterTemplatesByLessonId, Lesson, LetterTemplate } from '@slonigiraf/db';
import { bnToSlonFloatOrNaN } from '@slonigiraf/slonig-components';
import BN from 'bn.js';
import { getActionInfo } from '../utils.js';

interface Props {
  className?: string;
  lesson: Lesson;
  showLastAction?: boolean;
}



function LessonProcessInfo({ className = '', lesson, showLastAction = true }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [lessonStat, setLessonStat] = useState<LessonStat | null>(null);
  const lastAction = lesson?.lastAction;
  const [lastBonus, setLastBonus] = useState(0);

  useEffect(() => {
    const refreshLessonStat = async () => {
      const reexaminations = await getReexaminationsByLessonId(lesson.id);
      const letterTemplates = await getLetterTemplatesByLessonId(lesson.id);

      const nothingToDiscuss = (reexaminations.length + letterTemplates.length) === 0;
      if (!lesson || nothingToDiscuss) return;

      try {
        // Get fresh data

        const markedToRepeat = await getToRepeatLetterTemplatesByLessonId(lesson.id);
        const toIssueLetters: LetterTemplate[] = await getValidLetterTemplatesByLessonId(lesson.id);

        const askedToLearn = letterTemplates.length;
        const askedToLearnSecondTime = letterTemplates.filter(t => t.mature).length;
        const askedToLearnFirstTime = letterTemplates.length - askedToLearnSecondTime;
        const askedForReexaminations = reexaminations.length;

        const lastBonus = (lesson.reexamineStep > 0 && lesson.learnStep === 0) ? bnToSlonFloatOrNaN(new BN(reexaminations[lesson.reexamineStep - 1].amount)) : 0;
        setLastBonus(lastBonus);

        const issuedBadgeCount = toIssueLetters.length;
        const markedForRepeatCount = markedToRepeat.length;
        const validatedBadgesCount = reexaminations.filter(r => r.created !== r.lastExamined && r.valid).length;
        const revokedBadgesCount = reexaminations.filter(r => !r.valid).length;
        const totalProfitForReexamination = bnToSlonFloatOrNaN(
          reexaminations
            .filter((r) => !r.valid)
            .reduce((acc, r) => acc.add(new BN(r.amount)), new BN(0))
        );
        const totalProfitForTeaching = issuedBadgeCount * bnToSlonFloatOrNaN(new BN(lesson.dPrice));
        const totalProfit = totalProfitForReexamination + totalProfitForTeaching;
        const totalWarranty = issuedBadgeCount * bnToSlonFloatOrNaN(new BN(lesson.dWarranty));


        setLessonStat({
          learnStep: lesson.learnStep,
          reexamineStep: lesson.reexamineStep,
          askedToLearn,
          askedToLearnFirstTime,
          askedToLearnSecondTime,
          askedForReexaminations,
          issuedBadgeCount,
          markedForRepeatCount,
          validatedBadgesCount,
          revokedBadgesCount,
          totalProfitForReexamination,
          totalProfitForTeaching,
          totalProfit,
          totalWarranty,
        })

      } catch (error) {
        console.error(error);
      }
    };

    refreshLessonStat();

  }, [lesson]);


  const { icon, comment } = getActionInfo(lastAction);

  const lastEarning = lastBonus ? lastBonus :
    (lastAction === 'mark_mastered_mature' || lastAction === 'mark_mastered_warm_up') ? bnToSlonFloatOrNaN(new BN(lesson.dPrice)) : 0;

  const warrantyAmount = (lastAction === 'mark_mastered_mature' || lastAction === 'mark_mastered_warm_up') ? bnToSlonFloatOrNaN(new BN(lesson.dWarranty)) : 0;

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
        <StatElement><Icon icon={'trophy'} />&nbsp;{lessonStat?.issuedBadgeCount}</StatElement>
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