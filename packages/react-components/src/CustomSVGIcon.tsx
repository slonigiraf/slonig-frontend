import React from 'react';
import styled from 'styled-components';

interface Props {
  className?: string;
  color?: 'gray' | 'green' | 'normal' | 'orange' | 'red' | 'transparent' | 'white' | 'darkGray';
  isPadded?: boolean;
  isSpinning?: boolean; // not implemented, just for interface match
  onClick?: () => void;
  size?: '1x' | '2x' | '8x';
  tooltip?: string; // not implemented, just for interface match
  svg: React.ReactElement;
}

const StyledWrapper = styled.div<{ $size: string }>`
  display: inline-block;
  outline: none;
  width: ${({ $size }) =>
    $size === '2x' ? '2em' :
    $size === '8x' ? '8em' : '1em'};
  height: ${({ $size }) =>
    $size === '2x' ? '2em' :
    $size === '8x' ? '8em' : '1em'};

  svg {
    width: 100%;
    height: 100%;
    display: block;
    fill: currentColor;
  }

  &.isClickable {
    cursor: pointer;
  }

  &.isPadded {
    margin: 0 0.25rem;
  }

  &.grayColor {
    opacity: 0.25;
  }

  &.greenColor {
    color: green;
  }

  &.orangeColor {
    color: darkorange;
  }

  &.redColor {
    color: darkred;
  }

  &.transparentColor {
    color: transparent;
  }

  &.whiteColor {
    color: white;
  }

  &.darkGrayColor {
    color: #8B8B8B;
  }
`;

export default function CustomSVGIcon({
  className = '',
  color = 'normal',
  isPadded,
  isSpinning,
  onClick,
  size = '1x',
  tooltip,
  svg
}: Props): React.ReactElement {
  const classes = [
    'ui--Icon',
    `${color}Color`,
    isPadded ? 'isPadded' : '',
    onClick ? 'isClickable' : '',
    className
  ].join(' ');

  return (
    <StyledWrapper
      className={classes}
      onClick={onClick}
      $size={size}
      tabIndex={-1}
    >
      {svg}
    </StyledWrapper>
  );
}