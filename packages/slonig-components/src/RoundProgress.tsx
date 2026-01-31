import { Progress } from '@polkadot/react-components';
import React from 'react';

interface Props {
  value: number;
  total: number;
}

function RoundProgress({ value, total }: Props): React.ReactElement<Props> {
  const scale = 100;
  return <Progress value={scale * value} total={scale * total} />
}

export default React.memo(RoundProgress);