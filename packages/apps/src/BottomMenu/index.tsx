import React from 'react';
import styled from 'styled-components';
import { ScanQR } from '@slonigiraf/app-slonig-components';
import GoKnowledge from './GoKnowledge.js';
import GetSlon from './GetSlon.js';
import GoDiplomas from './GoDiplomas.js';
import { useApi } from '@polkadot/react-hooks';
import { useTranslation } from '../translate.js';

function BottomMenu(): React.ReactElement {
  const { isApiReady, isWaitingInjected } = useApi();
  const { t } = useTranslation();
  if( isApiReady && !isWaitingInjected){
    return (
      <MenuWrapper>
        <MenuItem><GoKnowledge /></MenuItem>
        <MenuItem><ScanQR label={t('QR')}/></MenuItem>
        <MenuItem><GoDiplomas /></MenuItem>
        <MenuItem><GetSlon /></MenuItem>
      </MenuWrapper>
    );
  } else{
    return <></>;
  }
  
}

const MenuWrapper = styled.div`
  display: flex;
  justify-content: space-around;
  align-items: center;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 70px;
  background-color: #f7f7f7;
  border-top: 1px solid #d1d1d1;
  z-index: 1000; 
`;

const MenuItem = styled.div`
  font-size: 12px;
  color: #666;
  text-align: center;
  flex: 1;
`;

export default BottomMenu;