import React from 'react';
import { Spinner, styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

interface Props {
  className?: string;
  caption?: string;
  captionElement?: React.ReactNode;
  children?: React.ReactNode;
  isLoading?: boolean;
}

function NotClosableFullscreen({ className = '', children, isLoading = false }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  return (
    <FullFindow>
      <CenterContainer>
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
const CenterContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0 auto;
  @media (min-width: 430px) {
    width: 430px;
  }
  min-height: 100%;
  padding-bottom: 10px;
`;

export default React.memo(NotClosableFullscreen);