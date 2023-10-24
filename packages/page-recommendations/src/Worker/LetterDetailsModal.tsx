// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { useTranslation } from '../translate.js';
import { Letter } from '../db/Letter.js';

interface Props {
  className?: string;
  text: string;
  letter: Letter;
}

function LetterDetailsModal({ className = '', text, letter }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (
    <div className='ui--row'>
      <h1>{text}</h1>
    </div>
  );
}

export default React.memo(LetterDetailsModal);