import React from 'react';
import { useTranslation } from './translate.js';
import { Button, styled } from '@polkadot/react-components';

interface Props {
  reload: () => void;
}

function AskToReload({ reload }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  return (
    <CenterItems>
      <StyledDiv>
        <h1>{t('A new version is available. Please reload the page.')}</h1>
        <Button className={'highlighted--button'} onClick={reload} icon={'rotate'} label={'Reload'} />
      </StyledDiv>
    </CenterItems>
  );
}
const StyledDiv = styled.div`
  width: 70%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
`;

const CenterItems = styled.div`
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
`;

export default React.memo(AskToReload);
