import React from 'react';
import { useTranslation } from '../translate.js';
import { Spinner, styled } from '@polkadot/react-components';
import { FullscreenActivity } from '@slonigiraf/slonig-components';

interface Props {
}

function RestoringProgress({ }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (
    <FullscreenActivity caption={''} backgroundColor={'var(--bg-page)'}>
      <StyledDiv>
        <Spinner label={t('Loading')} />
      </StyledDiv>
    </FullscreenActivity>
  );
}

const StyledDiv = styled.div`
  flex: 1;
  width: 70%;
  min-height: 0;
  display: flex;
  align-items: center;
  text-align: center;
  justify-content: center;  
`;

export default React.memo(RestoringProgress);
