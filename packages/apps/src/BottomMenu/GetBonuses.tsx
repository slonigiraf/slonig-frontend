import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { Button } from '@polkadot/react-components';

function ShowCourses(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const _onClick = () => {
    navigate('recommendations/worker');
  }

  return (
    <>
    <Button
          icon='award'
          label=''
          onClick={_onClick}
        />
    <br /><span>{t('Get Bonuses')}</span>
    </>
    
  );
}

export default ShowCourses;