import React from 'react';
import { VerticalCenterItemsContainer } from './index.js';
import { Button, styled } from '@polkadot/react-components';

interface Props {
  className?: string;
  caption?: string;
  children?: React.ReactNode;
  onClose: () => void;
}

function FullscreenActivity({ className = '', caption = ' ', children, onClose }: Props): React.ReactElement<Props> {
  return (
    <FullFindow>
      <VerticalCenterItemsContainer>
        <Top>
          <Caption><h1><b>{caption}</b></h1></Caption>
          <CloseButton onClick={onClose} icon='close' />
        </Top>
        {children}
      </VerticalCenterItemsContainer>
    </FullFindow>
  );
}

const FullFindow = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 999;
  background: var(--bg-page);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
`;

const Top = styled.div`
  margin-top: 20px;
  width: 100%;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  gap: 10px;
`;

const Caption = styled.div`
  text-align: center;
  width: 100%;
`;

const CloseButton = styled(Button)`
  flex-shrink: 0; /* don't let the button shrink */
`;

export default React.memo(FullscreenActivity);