import React, { useCallback, useState } from 'react';
import { useTranslation } from '../translate.js';
import { Button, Spinner, styled } from '@polkadot/react-components';
import { FullFindow, FullscreenActivity } from '@slonigiraf/slonig-components';

interface Props {
}

function RestoringProgress({ }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (
    <FullFindow>
      <FullscreenActivity caption={''}>
          <StyledDiv>
            <Spinner label={t('Loading')} />
          </StyledDiv>
      </FullscreenActivity>
    </FullFindow>
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
