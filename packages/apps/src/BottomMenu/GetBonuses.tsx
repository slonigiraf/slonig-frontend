import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { ButtonWithLabelBelow } from './ButtonWithLabelBelow';

function ShowCourses(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const _onClick = () => {
    navigate('recommendations/worker');
  }

  return (

    <ButtonWithLabelBelow
      icon='award'
      label={t('Get Bonuses')}
      onClick={_onClick}
    />

  );
}

export default ShowCourses;