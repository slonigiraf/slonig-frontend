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
  const showIcon = studentHasValidDiplomaForThisSkill || item.shouldBeRepeated;
  const icon = studentHasValidDiplomaForThisSkill ? 'medal' : 'rotate';
  return (
    <span>
      {showIcon && <><Icon icon={icon} color='gray'/>&nbsp;&nbsp;{caption}</>}
    </span>
  );
}
export default React.memo(BadgeCheck);