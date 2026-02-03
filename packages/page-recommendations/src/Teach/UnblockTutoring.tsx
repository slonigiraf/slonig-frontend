import React from 'react';
import { useTranslation } from '../translate.js';
import { styled } from '@polkadot/react-components';
import { FullscreenActivity } from '@slonigiraf/slonig-components';

interface Props {
  onClose: () => void;
}

function UnblockTutoring({ onClose }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (
    <FullscreenActivity caption={t('You were a bad tutor')} onClose={onClose} >
      <StyledDiv>
        
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
  flex-direction: column;
  gap: 10px;
  h1 {
    margin-top: 0px;
    margin-bottom: 0px;
  }
`;

export default React.memo(UnblockTutoring);
