import React from 'react';
import { useTranslation } from './translate.js';
import { FullWidthContainer } from './index.js';

function MillerLawComment(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <FullWidthContainer>
      <a
        href='https://en.wikipedia.org/wiki/The_Magical_Number_Seven,_Plus_or_Minus_Two'
        target='_blank'>
        {t('Miller\'s law limit text to 7 words.')}
      </a>
    </FullWidthContainer>
  );
}

export default React.memo(MillerLawComment);