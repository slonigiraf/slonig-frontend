import React, { useCallback, useEffect } from 'react';
import { Button } from '@polkadot/react-components';
import { useLoginContext } from './LoginContext.js';
import { styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

function LoginButton(): React.ReactElement {
    const { isLoggedIn, setLoginIsRequired } = useLoginContext();
    const { t } = useTranslation();
    const login = useCallback(() => { setLoginIsRequired(true) }, [setLoginIsRequired]);
    useEffect(() => {
        if (!isLoggedIn) {
            setLoginIsRequired(true);
        }
    }, [isLoggedIn, setLoginIsRequired]);
    return (
        isLoggedIn ? <></> :
            <StyledDiv>
                <Button
                    icon='right-to-bracket'
                    label={t('Sign Up for Slonig')}
                    onClick={login}
                />
            </StyledDiv>
    );
}
const StyledDiv = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  margin-top: '1rem'
`;
export default React.memo(LoginButton);