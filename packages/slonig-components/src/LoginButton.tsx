import React, { useCallback, useEffect } from 'react';
import { Button } from '@polkadot/react-components';
import { useLoginContext } from './LoginContext.js';

interface Props {
    label: string;
}

function LoginButton({ label }: Props): React.ReactElement<Props> {
    const { isLoggedIn, setLoginIsRequired } = useLoginContext();
    const login = useCallback(() => { setLoginIsRequired(true) }, [setLoginIsRequired]);
    useEffect(() => {
        if(!isLoggedIn){
            setLoginIsRequired(true);
        }
    }, [isLoggedIn, setLoginIsRequired]);
    return (
        isLoggedIn ? <></> : <Button
            icon='right-to-bracket'
            label={label}
            onClick={login}
        />
    );
}

export default React.memo(LoginButton);