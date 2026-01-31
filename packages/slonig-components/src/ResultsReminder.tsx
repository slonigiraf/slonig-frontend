import React, { useEffect, useState } from 'react';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
import { getBaseUrl, getIPFSDataFromContentID, parseJson, QRWithShareAndCopy, useIpfsContext, VerticalCenterItemsContainer, VerticallyCenteredModal, KatexSpan } from './index.js';
import { LearnRequest } from '@slonigiraf/db';
interface Props {
  learnRequest: LearnRequest;
  onClose: () => void;
}

function ResultsReminder({ learnRequest, onClose }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const { ipfs } = useIpfsContext();
  const [lessonName, setLessonName] = useState('');

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && learnRequest) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, learnRequest.cid);
          const json = parseJson(content);
          setLessonName(json.h);
        }
        catch (e) {
          setLessonName(learnRequest.cid + " (" + t('loading') + "...)")
          console.log(e)
        }
      }
    }
    fetchData()
  }, [ipfs, learnRequest])


  const url = getBaseUrl() + `/#/badges/teach?learnRequest=${learnRequest.id}`;

  const min = Math.round((Date.now() - learnRequest.created)/60_000);

  return (
    <VerticallyCenteredModal
      header=''
      onClose={onClose}
      size="small"
    >
      <Modal.Content>
        <VerticalCenterItemsContainer>

          <Title>{t('You forgot to receive the lesson results. Ask the tutor to scan')}</Title>
          <h2><KatexSpan content={lessonName} /></h2>
          <span>{t('🕑 {{min}} minutes ago', {replace: {min: min}})}</span>
          <QRWithShareAndCopy
            titleShare={t('QR code')}
            textShare={t('Press the link to send Slon')}
            urlShare={url}
            dataCopy={url} />
        </VerticalCenterItemsContainer>

        <ButtonsRow>
          <Button className='highlighted--button' label={t('Cancel')} onClick={onClose} />
        </ButtonsRow>
      </Modal.Content>
    </VerticallyCenteredModal >
  );
}
const ButtonsRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 40px;
  margin-top: 20px;
  .ui--Button {
    width: 100px;
    text-align: center;
  }
`;

const Title = styled.h1`
  width: 100%;
  text-align: center;
  margin: 0.5rem 0 0;
`;

export default React.memo(ResultsReminder);