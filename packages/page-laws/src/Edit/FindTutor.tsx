// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Toggle } from '@polkadot/react-components';
import React from 'react';
import { useTranslation } from '../translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { CenterQRContainer, LawType } from '@slonigiraf/app-slonig-components';
import SkillQR from './SkillQR.js';

interface Props {
  className?: string;
  id: string;
  cid: string;
}

function FindTutor({ className = '', id, cid }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);

  return (
    <>
      <Toggle
        label={t('Find a tutor')}
        onChange={toggleDetailsOpen}
        value={areDetailsOpen}
      />
      <div className='ui--row' style={areDetailsOpen ? {} : { display: 'none' }}>
        <SkillQR id={id} cid={cid} type={LawType.MODULE}/>
      </div>
    </>
  )
}

export default React.memo(FindTutor);