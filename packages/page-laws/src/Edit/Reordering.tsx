// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback } from 'react';
import { Button, Label } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';

interface Props {
  className?: string;
  list: any;
  onListChange: (updatedList: any) => void;
}

function Reordering({ className = '', list, onListChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (list == null | list.e == null) ? "" : (
    <>
      {list.e.map((item, index) => (
        <div className='ui--row' key={index} 
        style={{
          alignItems: 'center'
        }}
        >
          <Button
            icon='arrow-up'
          />
          <Button
            icon='arrow-down'
          />
          <Label label={item} />
        </div>
      ))}
    </>
  );
}

export default React.memo(Reordering);
