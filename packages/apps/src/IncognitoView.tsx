import React from 'react';
import { useTranslation } from './translate.js';
import { styled } from '@polkadot/react-components';



function IncognitoView(): React.ReactElement {
  const { t } = useTranslation();
  return (
    <StyledDiv>
      <div style={{ display: 'flex', justifyContent: 'center', width: '80%' }}>
        <img src="./no-incognito.png" style={{ width: '100%' }} alt="Signup" />
      </div>
        <h1>{t('Please close this private / incognito window and open the site in a normal one.')}</h1>
    </StyledDiv>
  );
}
const StyledDiv = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100dvh;
  text-align: center;
  flex-direction: column;

  @media only screen and (max-width: 430px) {
    width: 100%;
  }
  @media only screen and (min-width: 431px) {
    width: 400px;
  }
`;

export default React.memo(IncognitoView);
