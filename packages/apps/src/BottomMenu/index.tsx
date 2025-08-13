import React from 'react';
import { HorizontalCenterItemsContainer, ScanQR } from '@slonigiraf/app-slonig-components';
import GoKnowledge from './GoKnowledge.js';
import GetSlon from './GetSlon.js';
import GoBadges from './GoBadges.js';
import { useTranslation } from '../translate.js';
import { styled } from '@polkadot/react-components';

function BottomMenu(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <MenuWrapper>
      <HorizontalCenterItemsContainer>
        <MenuItem><GoKnowledge /></MenuItem>
        <MenuItem><ScanQR label={t('Scan')} /></MenuItem>
        <MenuItem><GoBadges /></MenuItem>
        <MenuItem><GetSlon /></MenuItem>
      </HorizontalCenterItemsContainer>
    </MenuWrapper>
  );
}

const MenuWrapper = styled.div`
  display: flex;
  justify-content: center; // Center the inner container
  align-items: center;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 70px;
  background-color: #f7f7f7;
  border-top: 1px solid #d1d1d1;
  z-index: 998;  
`;

const MenuItem = styled.div`
  font-size: 12px;
  color: #666;
  text-align: center;
  flex: 1;
`;

export default BottomMenu;