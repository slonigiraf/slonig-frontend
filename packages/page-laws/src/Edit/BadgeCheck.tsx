import React from 'react';
import { Icon } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';

interface Props {
  className?: string;
  item: ItemWithCID;
  caption?: string;
}

function BadgeCheck({ className = '', item, caption }: Props): React.ReactElement<Props> {
  const studentHasValidDiplomaForThisSkill = item.validDiplomas.length > 0;
  const icon = studentHasValidDiplomaForThisSkill ? 'check' : 'lightbulb';
  return (
    <span>
      {studentHasValidDiplomaForThisSkill && <><Icon icon={icon} color='gray'/>&nbsp;{caption}</>}
    </span>
  );
}
export default React.memo(BadgeCheck);