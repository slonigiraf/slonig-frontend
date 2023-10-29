import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import React, { useState, useCallback } from 'react';
import { InputAddress } from '@polkadot/react-components';

function PayToAccountQr(): React.ReactElement {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const hiddenAccountSelector = <div style={{ display: 'none' }}>
    <InputAddress
      className='full'
      help={''}
      isInput={false}
      label={''}
      onChange={_onChangeAccount}
      type='account'
    />
  </div>;

  return (
    <>
      {hiddenAccountSelector}
      <h2>Address: {currentPair.address}</h2>
    </>
  );
}

export default PayToAccountQr;