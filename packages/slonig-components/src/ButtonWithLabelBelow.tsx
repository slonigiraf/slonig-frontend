import React, { useState } from 'react';
import { Button, CustomSVGIcon, Icon, styled } from '@polkadot/react-components';
import { HintBubble } from './index.js';

const IconWrapper = styled.div`
  display: block;
  text-align: center;
  margin-bottom: 0.7rem;
  min-width: 65px;
  svg {
    max-width: 15px;
    max-height: 15px;
    width: 100%;
    height: auto;
    display: inline-block;
  }
`;

const StyledLabel = styled.span`
  display: block;
  text-align: center;
`;

export default function ButtonWithLabelBelow(props: any) {
  const { icon, svg, label, hint, showHint, ...restProps } = props;
  const [isHintShown, setIsHintShown] = useState(showHint);
  return (
    <>{isHintShown &&
      <HintBubble onClick={() => setIsHintShown(false)}>
        <h2>{hint}</h2>
      </HintBubble>
    }
      <Button className="icon-button-with-label-below noHighlight" {...restProps}>
        {icon && <IconWrapper><Icon icon={icon} /></IconWrapper>}
        {svg && <IconWrapper><CustomSVGIcon svg={svg} /></IconWrapper>}
        {label && <StyledLabel>{label}</StyledLabel>}
      </Button>
    </>
  );
}