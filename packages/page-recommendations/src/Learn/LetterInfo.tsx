// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Modal, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import { KatexSpan, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components'
import { useTranslation } from '../translate.js';
import { Letter } from '@slonigiraf/db';
import LetterDetailsModal from './LetterDetailsModal.js';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';

interface Props {
  letter: Letter;
  isSelected: boolean;
  onToggleSelection: (letter: Letter) => void;
}

function LetterInfo({ letter, isSelected, onToggleSelection }: Props): React.ReactElement<Props> {
  const { ipfs } = useIpfsContext();
  const { t } = useTranslation();
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [text, setText] = useState(letter.cid);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && text === letter.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, letter.cid);
          const json = parseJson(content);
          setText(json.h);
          setLoaded(true);
        } catch (e) {
          setText(`${letter.cid} (${t('loading')}...)`);
          console.log(e);
        }
      }
    }
    fetchData();
  }, [ipfs, letter, text, t]);

  return (
    <StyledDiv >
      <Button
        icon={isSelected ? 'check' : 'square'}
        onClick={() => onToggleSelection(letter)}
      />
      {loaded ? <KatexSpan content={text} /> : <Spinner noLabel />}
      <Button
        icon="question"
        label=""
        onClick={() => setModalIsOpen(true)}
      />
      {modalIsOpen && (
        <Modal
          header={t('Diploma')}
          size="small"
          onClose={() => setModalIsOpen(false)}
        >
          <Modal.Content>
            {loaded ? (
              <LetterDetailsModal text={text} letter={letter} />
            ) : (
              <Spinner noLabel />
            )}
          </Modal.Content>
        </Modal>
      )}
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: start;
  padding: 10px;
  padding-left: 6px;
  > span {
    margin-right: 10px;
    margin-left: 10px;
  }
  .ui--Spinner {
    width: 50px;
    margin-left: 25px;
    margin-right: 25px;
  }
`;

export default React.memo(LetterInfo);