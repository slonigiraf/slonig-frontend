import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { ButtonWithLabelBelow } from '@slonigiraf/slonig-components';

function GoBadges(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const _onClick = () => {
    navigate('badges');
  }

  return (

    <ButtonWithLabelBelow
      icon='medal'
      label={t('Badges')}
      onClick={_onClick}
    />

  );
}

export default GoBadges;