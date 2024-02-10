// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Modal, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import { getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components'
import { useTranslation } from '../translate.js';
import { Letter } from '../db/Letter.js';
import LetterDetailsModal from './LetterDetailsModal.js';
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
      icon={isSelected ? 'check' : 'square'}
      onClick={() => onToggleSelection && onToggleSelection(letter)}
    />
    ;

  return (
    <StyledDiv>
      {buttonSelect}
      <span>{text}</span>
      {buttonView}
    </StyledDiv>
  )
}
const StyledDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: start;
  padding: 10px;
  > span {
    margin-right: 10px;
    margin-left: 10px;
  }
`;
export default React.memo(LetterInfo);