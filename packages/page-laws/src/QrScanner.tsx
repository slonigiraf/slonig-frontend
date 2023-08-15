// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { QrReader, QrReaderProps } from 'react-qr-reader'
import { Button } from '@polkadot/react-components';
import React, { useState } from 'react'
import { useTranslation } from './translate.js';
import styled from 'styled-components';

function QrScanner({ onResult, constraints, className = '' }: QrReaderProps): React.ReactElement<QrReaderProps> {
  const [mode, setMode] = useState(constraints);
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);

  const changeMode = () => {
    setVisible(false);
    if (mode.facingMode === 'user') {
      setMode({ facingMode: 'environment' });
    } else {
      setMode({ facingMode: 'user' });
    }
    setTimeout(function () {
      setVisible(true);
    }, 1);
  }

  return (
    <div className={`qr-wrapper ${className}`}>
      <div className={`qr-size`}>
        <section className="ui--qr-Scan">
          <section className="ui--qr-Scan-container">
            <div className="ui--qr-Scan-focus" />
            {visible &&
              <QrReader
                onResult={onResult}
                constraints={mode}
              />
            }
          </section>
        </section>
      </div>
      <Button
        icon='repeat'
        label={t('Change camera')}
        onClick={changeMode}
      />
    </div>)
}

export default React.memo(styled(QrScanner)`
    text-align: center;
    max-width: 30rem;
    margin: 0px auto;
    .qr-size{
      height: auto;
      width: 100%;
    }
    .ui--qr-Scan{
      display: inline-block;
      height: 100%;
      transform: matrix(-1, 0, 0, 1, 0, 0);
      width: 100%;
    }
    .ui--qr-Scan-container{
      overflow: hidden;
      position: relative;
      width: 100%;

      video {
        top: 0px;
        left: 0px;
        display: block;
        position: absolute;
        overflow: hidden;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }
    .ui--qr-Scan-focus{
      top: 0px;
      left: 0px;
      z-index: 1;
      box-sizing: border-box;
      border: 50px solid rgba(0, 0, 0, 0.3);
      box-shadow: rgb(255 0 0 / 50%) 0px 0px 0px 5px inset;
      position: absolute;
      width: 100%;
      height: 100%;
    }
`);