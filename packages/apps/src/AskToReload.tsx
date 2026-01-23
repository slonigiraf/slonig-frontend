import React, { useCallback, useState } from 'react';
import { useTranslation } from './translate.js';
import { Button, Spinner, styled } from '@polkadot/react-components';
import { FullFindow, FullscreenActivity } from '@slonigiraf/slonig-components';

interface Props {
  reload: () => void;
}

function AskToReload({ reload }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [isReloading, setIsReloading] = useState(false);

  const onReload = useCallback(() => {
    setIsReloading(true);
    reload();
  }, []);
  return (
    <FullFindow>
      <FullscreenActivity caption={''}>
          <StyledDiv>
            {isReloading ?
              <Spinner label={t('Loading')} />
              :
              <>
                <h1>{t('A new version is available. Please reload the page.')}</h1>
                <Button className={'highlighted--button'} onClick={onReload} icon={'rotate'} label={'Reload'} />
              </>
            }
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
  flex-direction: column;
  gap: 10px;
  h1 {
    margin-top: 0px;
    margin-bottom: 0px;
  }
  h2 {
    margin-top: 0px;
    margin-bottom: 0px;
  }
`;

export default React.memo(AskToReload);
