import React from 'react';
import { styled } from '@polkadot/react-components';
import PenaltyInfo from './PenaltyInfo.js';
import { useTranslation } from './translate.js';
import BN from 'bn.js';
import { BN_ZERO } from '@polkadot/util';
import { bnToSlonFloatOrNaN } from './utils.js';
import { Penalty } from './index.js';

interface Props {
  penalties: Penalty[];
}

function Penalties({ penalties }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();

  if (penalties === undefined || penalties.length === 0) {
    return <></>;
  }

  const amount = (penalties ?? [])
    .map((p: Penalty) => new BN(p.amount))
    .reduce((acc: BN, v: BN) => acc.add(v), BN_ZERO);


  return (
    <>
      <h2>{t('I lost {{amount}} Slon because of issuing these badges', {replace: {amount: bnToSlonFloatOrNaN(amount)}})}</h2>
      {penalties?.map((item: Penalty) => (
        <LetterTemplateInfo key={`${item.lesson}-${item.letterId}`}>
          <PenaltyInfo badge={item} student={item.student} />
        </LetterTemplateInfo>
      ))}
      {penalties && penalties.length === 0 &&
        <LetterTemplateInfo key={'nothing'}>
          <span>{t('Here you will see the data if you issue a badge to a student and another tutor, teacher, or the student’s parent penalizes you because the student forgot the skill.')}</span>
        </LetterTemplateInfo>
      }
    </>
  );
}
const LetterTemplateInfo = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: left;
  align-items: center;
  width: 100%;
  padding-left: 10px;
  margin-top: 10px;
`;


export default React.memo(Penalties);
