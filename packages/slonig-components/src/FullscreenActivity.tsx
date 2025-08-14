import React from 'react';
import { FullFindow, VerticalCenterItemsContainer } from './index.js';
import { Button, styled } from '@polkadot/react-components';

interface Props {
  className?: string;
  caption?: string;
  content: React.ReactNode;
  onClose: () => void;
}

function FullscreenActivity({ className = '', caption = '', content, onClose }: Props): React.ReactElement<Props> {
  return (
    <FullFindow>
      <Top>
        <Caption>{caption}</Caption>
        <CloseButton onClick={onClose} icon='close' />
      </Top>
      <VerticalCenterItemsContainer>
        {content}
      </VerticalCenterItemsContainer>
    </FullFindow>
  );
}
const Caption = styled.div`
  position: relative;
  float: left;
  margin-left: 20px;
`;
const CloseButton = styled(Button)`
  position: relative;
  float: right;
  margin-right: 20px;
  margin-left: 10px;
`;
const Top = styled.div`
  margin-top: 20px;
  width: 100%;
  display: flex;
  flex-direction: row;
  spacing 10px;
`;
export default React.memo(FullscreenActivity);