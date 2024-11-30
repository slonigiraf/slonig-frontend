import type { UInt } from '@polkadot/types';
import type { BN } from '@polkadot/util';

import React from 'react';

import { bnToBn } from '@polkadot/util';

import { styled } from './styled.js';

interface Props {
  className?: string;
  isBlurred?: boolean;
  isDisabled?: boolean;
  total?: UInt | BN | number | null;
  value?: UInt | BN | number | null;
}

function LinearProgress({ className = '', isBlurred, isDisabled, total, value }: Props): React.ReactElement<Props> | null {
  const _total = bnToBn(total || 0);
  const percentage = _total.gtn(0)
    ? (bnToBn(value || 0).muln(10000).div(_total).toNumber() / 100)
    : 0;

  if (percentage < 0 || percentage > 100) {
    return null;
  }

  return (
    <StyledDiv className={`${className} ui--LinearProgress ${isDisabled ? 'isDisabled' : ''} ${isBlurred ? '--tmp' : ''}`}>
      <div className="background">
        <div
          className="progress highlight--bg"
          style={{ width: `${percentage.toFixed(1)}%` }}
        />
      </div>
      <div className="inner">
        <div>{value?.toString()} / {total?.toString()}</div>
      </div>
    </StyledDiv>
  );
}

const HEIGHT = '1.5rem';

const StyledDiv = styled.div`
  position: relative;
  width: 100%;
  height: ${HEIGHT};
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: inset 0 0 0.25rem rgba(0, 0, 0, 0.1);

  &.isDisabled {
    filter: grayscale(100%);
    opacity: 0.25;
  }

  .background {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #f5e7d8;
  }

  .progress {
    height: 100%;
    transition: width 0.2s ease;
    z-index: 2;
  }

  .inner {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-small);
    color: var(--text-color, #000);
    z-index: 3;

    div {
      line-height: 1;
    }
  }
`;

export default React.memo(LinearProgress);