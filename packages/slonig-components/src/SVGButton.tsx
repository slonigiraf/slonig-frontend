import React from 'react';
import { Button, styled } from '@polkadot/react-components';

const ButtonContent = styled.div`
  display: flex;
  align-items: center;
  gap: 0.975rem;
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const StyledLabel = styled.span`
  text-align: left;
`;

export default function SVGButton(props: any) {
  const { icon, svg, label, ...restProps } = props;
  return (
    <Button {...restProps}>
      <ButtonContent>
        {svg && <IconWrapper>{svg}</IconWrapper>}
        {label && <StyledLabel>{label}</StyledLabel>}
      </ButtonContent>
    </Button>
  );
}