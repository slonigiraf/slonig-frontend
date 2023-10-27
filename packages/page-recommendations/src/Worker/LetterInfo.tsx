// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Modal } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import { getIPFSDataFromContentID } from '@slonigiraf/helpers'
import { useTranslation } from '../translate';
import { Letter } from '../db/Letter';
import { parseJson } from '@slonigiraf/app-slonig-components';
import LetterDetailsModal from './LetterDetailsModal';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  letter: Letter;
  isSelected: Boolean;
  onToggleSelection?: (letter: Letter) => void; // Add this prop
}

function LetterInfo({ className = '', letter, isSelected, onToggleSelection }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();
  const [modalIsOpen, setModalIsOpen] = useState(false)
  const [text, setText] = useState(letter.cid)

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && text === letter.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, letter.cid);
          const json = parseJson(content);
          setText(json.h);
        }
        catch (e) {
          setText(letter.cid + " (" + t('loading') + "...)")
          console.log(e)
        }
      }
    }
    fetchData()
  }, [ipfs, letter, text])

  const buttonView = <>
    <Button
      icon='question'
      label={""}
      onClick={() => setModalIsOpen(true)}
    />
    {modalIsOpen && <Modal
      header={t('Diploma')}
      size={"small"}
      onClose={() => setModalIsOpen(false)}
    >
      <Modal.Content>
        <LetterDetailsModal text={text} letter={letter} />
      </Modal.Content>
    </Modal>
    }
  </>;

  const buttonSelect = 
    <Button
      icon={isSelected ? 'fa-check' : 'fa-square'} 
      label={text}
      onClick={() => onToggleSelection && onToggleSelection(letter)}
    />
  ;

  return (
    <>
    {buttonSelect}
    {buttonView}</>
  )
}

export default React.memo(LetterInfo);