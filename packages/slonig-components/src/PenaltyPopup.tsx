import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
import { Penalties, Penalty, VerticallyCenteredModal } from './index.js';
import { getPenalties } from '@slonigiraf/db';
interface Props {
  onClose: () => void;
}

function PenaltyPopup({ onClose }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const now = Date.now();
  const penalties = useLiveQuery<Penalty[]>(() => getPenalties(now - 20_000, now), []);

  if(penalties === undefined || penalties.length === 0) return <></>;

  return (
    <VerticallyCenteredModal
      header=''
      onClose={onClose}
      size='small'
    >
      <Modal.Content>
        <h1>{t('Another tutor penalized me')}</h1>
        <Penalties penalties={penalties} />
        <ButtonsRow>
          <Button className='highlighted--button' label={t('OK')} onClick={onClose} />
        </ButtonsRow>
      </Modal.Content>
    </VerticallyCenteredModal>
  );
}
const ButtonsRow = styled.div`
  width: 100%;
  margin-top: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 40px;
  .ui--Button {
    width: 100px;
    text-align: center;
  }
`;


export default React.memo(PenaltyPopup);