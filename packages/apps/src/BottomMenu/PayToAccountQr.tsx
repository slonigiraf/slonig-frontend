import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import React, { useState, useCallback } from 'react';
import { InputAddress } from '@polkadot/react-components';
import QRCode from 'qrcode.react';

function PayToAccountQR(): React.ReactElement {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const qrText = `{"q": 1,"d": "${currentPair.address}"}`;

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
      <QRCode value={qrText} />
    </>
  );
}

export default React.memo(PayToAccountQR);