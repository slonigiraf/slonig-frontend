// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Icon, styled } from '@polkadot/react-components';
import React, { useMemo } from 'react';
import { useTranslation } from './translate.js';
import { LessonResult } from '@slonigiraf/slonig-components';

interface Props {
  className?: string;
  title: string;
  lessonResult: LessonResult;
}

type StatRow = {
  key: string;
  icon: Parameters<typeof Icon>[0]['icon'];
  count: number;
  label: string;
};

function parseReexaminationValidFlags(values: string[]): boolean[] {
  return values.map((v) => v.split(',')[2] === '1');
}

function LessonResultInfo({ className = '', title, lessonResult }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  const rows = useMemo<StatRow[]>(() => {
    const validFlags = parseReexaminationValidFlags(lessonResult.reexaminations);
    const validReexaminations = validFlags.filter(Boolean).length;
    const canceledReexaminations = validFlags.length - validReexaminations;

    const all: StatRow[] = [
      {
        key: 'survived',
        icon: 'shield',
        count: validReexaminations,
        label: t('Badges survived the reexamination'),
      },
      {
        key: 'canceled',
        icon: 'shield-halved',
        count: canceledReexaminations,
        label: t('Canceled badges'),
      },
      {
        key: 'repeat',
        icon: 'rotate',
        count: lessonResult.repetitions.length,
        label: t('Skills to repeat'),
      },
      {
        key: 'new',
        icon: 'medal',
        count: lessonResult.letters.length,
        label: t('New badges'),
      },
    ];

    return all.filter((r) => r.count > 0);
  }, [lessonResult, t]);

  return (
    <StyledDiv className={className}>
      <TotalStat>
        {title && <h3>{title}</h3>}

        {rows.length > 0 && (
          <StatGrid>
            {rows.map((row) => (
              <React.Fragment key={row.key}>
                <Icon icon={row.icon} />
                <StatNumber>{row.count}</StatNumber>
                <StatLabel>{row.label}</StatLabel>
              </React.Fragment>
            ))}
          </StatGrid>
        )}
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
    color: inherit;
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

export default React.memo(LessonResultInfo);