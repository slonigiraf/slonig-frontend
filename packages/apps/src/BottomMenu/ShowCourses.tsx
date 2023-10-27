import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { Button } from '@polkadot/react-components';

function ShowCourses(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const _onClick = () => {
    navigate('curriculum');
  }

  return (
    <Button
          icon='list'
          label={t('Courses')}
          onClick={_onClick}
        />
  );
}

export default ShowCourses;