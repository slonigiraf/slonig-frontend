// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Toggle } from '@polkadot/react-components';
import React, { useCallback, useState } from 'react';
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
  const [isLearningRequested, setLearningRequested] = useState(false);
  const [isReexaminingRequested, setReexaminingRequested] = useState(false);

  // Function to handle the Learning toggle
  const handleLearningToggle = useCallback((checked: boolean): void => {
    setLearningRequested(checked); // Use the value passed from Toggle
    if (checked) {
      setReexaminingRequested(false); // Ensure reexamining is false if learning is true
    }
  }, []);

  // Function to handle the Reexamining toggle
  const handleReexaminingToggle = useCallback((checked: boolean): void => {
    setReexaminingRequested(checked); // Use the value passed from Toggle
    if (checked) {
      setLearningRequested(false); // Ensure learning is false if reexamining is true
    }
  }, []);

  const isModuleQRVisible = (isLearningRequested || isReexaminingRequested);

  return (
    <>
      <Toggle
        label={t('Learn with a tutor')}
        onChange={handleLearningToggle}
        value={isLearningRequested}
      />
      <Toggle
        label={t('Reexamine my diplomas')}
        onChange={handleReexaminingToggle}
        value={isReexaminingRequested}
      />
      <div className='ui--row' style={isModuleQRVisible ? {} : { display: 'none' }}>
        <SkillQR id={id} cid={cid} type={LawType.MODULE}/>
      </div>
    </>
  )
}

export default React.memo(FindTutor);