import React from 'react';
import { Button, Spinner, styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

interface Props {
  className?: string;
  backgroundColor?: string;
  caption?: string;
  captionElement?: React.ReactNode;
  children?: React.ReactNode;
  isLoading?: boolean;
  onClose?: () => void;
}

function FullscreenActivity({ className = '', backgroundColor = 'white', caption = ' ', captionElement, children, isLoading = false, onClose }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  return (
    <FullFindow>
      <CenterContainer backgroundColor={backgroundColor}>
        <Top>
          <Caption>
            <h1><b>{captionElement || caption}</b></h1>
          </Caption>
          {onClose && <CloseButton onClick={onClose} icon='close' />}
        </Top>
        {isLoading ?
          <div className='connecting'>
            <Spinner label={t('Loading')} />
          </div> :
          children}

      </CenterContainer>
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
const CenterContainer = styled.div<{ backgroundColor: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0 auto;
  background: ${props => props.backgroundColor};
  @media (min-width: 430px) {
    width: 430px;
  }
  min-height: 100%;
  padding-bottom: 10px;
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