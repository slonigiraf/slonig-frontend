import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { ButtonWithLabelBelow } from './ButtonWithLabelBelow';

function GoDiplomas(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const _onClick = () => {
    navigate('recommendations');
  }

  return (

    <ButtonWithLabelBelow
      icon='award'
      label={t('Diplomas')}
      onClick={_onClick}
    />

  );
}

export default GoDiplomas;