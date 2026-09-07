import type { Ability } from '@slonigiraf/db';

import { deleteAbilities, getAbilities } from '@slonigiraf/db';
import { Confirmation } from '@slonigiraf/slonig-components';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { useCallback, useState } from 'react';

import { Button } from '@polkadot/react-components';

import { useTranslation } from '../translate.js';
import AbilityInfo from './AbilityInfo.js';

interface Props {
  className?: string;
  moduleId: string;
}

const AbilityList: React.FC<Props> = ({ className = '', moduleId }: Props) => {
  const { t } = useTranslation();
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const abilities = useLiveQuery(() => getAbilities(moduleId), [moduleId]);

  const closeClearConfirmation = useCallback(() => {
    setIsClearConfirmationOpen(false);
  }, []);
  const clearAbilities = useCallback(() => {
    deleteAbilities(moduleId).then(closeClearConfirmation).catch(console.error);
  }, [closeClearConfirmation, moduleId]);
  const openClearConfirmation = useCallback(() => {
    setIsClearConfirmationOpen(true);
  }, []);

  return (<div className={className}>
    {abilities && abilities.length > 0 && (
      <Button
        icon='trash-can'
        label={t('Clear abilities')}
        onClick={openClearConfirmation}
      />
    )}
    {abilities && abilities.map((ability: Ability) => (
      <div
        className='ui--row'
        key={ability.id}
        style={{
          alignItems: 'center'
        }}
      >
        <AbilityInfo ability={ability} />
      </div>
    ))}
    {isClearConfirmationOpen && (
      <Confirmation
        onClose={closeClearConfirmation}
        onConfirm={clearAbilities}
        question={t('Clear all abilities for this module?')}
      />
    )}
  </div>
  );
};

export default AbilityList;
