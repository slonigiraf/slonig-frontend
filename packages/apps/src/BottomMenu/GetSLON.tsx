import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { Button } from '@polkadot/react-components';

function GetSLON(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const _onClick = () => {
    navigate('curriculum');
  }

  return (
    <>
    <Button
          icon='dollar'
          label=''
          onClick={_onClick}
        />
    <br /><span>{t('Get SLON')}</span>
    </>
    
  );
}

export default GetSLON;