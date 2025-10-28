// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { useTranslation } from '../translate.js';
import { Letter } from '@slonigiraf/db';
import { KatexSpan } from '@slonigiraf/slonig-components';

interface Props {
  className?: string;
  text: string;
  letter: Letter;
}

function LetterDetailsModal({ className = '', text, letter }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (
    <div className='ui--row'>
      <h1><KatexSpan content={text}/></h1>
    </div>
  );
}

export default React.memo(LetterDetailsModal);