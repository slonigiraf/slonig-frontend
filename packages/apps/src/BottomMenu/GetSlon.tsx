import { useTranslation } from '../translate.js';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ButtonWithLabelBelow, slonSVG } from '@slonigiraf/slonig-components';

function GetSlon(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const _onClick = () => {
    navigate('accounts');
  };

  return (
    <ButtonWithLabelBelow
      svg={slonSVG}
      label={t('Slon')}
      onClick={_onClick}
    />
  );
}

export default GetSlon;