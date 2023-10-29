import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import React, { useState } from 'react';

function PayToAccountQr(): React.ReactElement {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);

  return (
    <>
    <h2>Address: {currentPair.address}</h2>
    </>
  );
}

export default PayToAccountQr;