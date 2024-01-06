import React, { useCallback } from 'react';
import { Button } from '@polkadot/react-components';
import { useLoginContext } from './LoginContext.js';

interface Props {
    label: string;
}

function LoginButton({ label }: Props): React.ReactElement<Props> {
    const { isLoggedIn, setLoginIsRequired } = useLoginContext();
    const _login = useCallback(() => { setLoginIsRequired(true) }, [setLoginIsRequired]);
    return (
        isLoggedIn ? <></> : <Button
            icon='right-to-bracket'
            label={label}
            onClick={_login}
        />
    );
}

export default React.memo(LoginButton);