import React from 'react';
import { Button, Icon } from '@polkadot/react-components';
import styled from 'styled-components';

const IconWrapper = styled.div`
  display: block;
  text-align: center;
  margin-bottom: 0.7rem;
`;

const StyledLabel = styled.span`
  display: block;
  text-align: center;
`;

export function ButtonWithLabelBelow(props: any) {
  const { icon, label, ...restProps } = props;

  return (
    <Button className="icon-button-with-label-below" {...restProps}>
      {icon && <IconWrapper><Icon icon={icon} /></IconWrapper>}
      {label && <StyledLabel>{label}</StyledLabel>}
    </Button>
  );
}