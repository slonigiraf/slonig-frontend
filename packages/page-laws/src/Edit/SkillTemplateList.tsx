import type { SkillTemplate } from 'db/src/db/SkillTemplate.js';

import { deleteSkillTemplates, getSkillTemplates } from '@slonigiraf/db';
import { Confirmation } from '@slonigiraf/slonig-components';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { useCallback, useState } from 'react';

import { Button } from '@polkadot/react-components';

import { useTranslation } from '../translate.js';
import SkillTemplateInfo from './SkillTemplateInfo.js';

interface Props {
  className?: string;
  moduleId: string;
}

const SkillTemplateList: React.FC<Props> = ({ className = '', moduleId }: Props) => {
  const { t } = useTranslation();
  const [isClearConfirmationOpen, setIsClearConfirmationOpen] = useState(false);
  const skillTemplates = useLiveQuery(() => getSkillTemplates(moduleId), [moduleId]);

  const closeClearConfirmation = useCallback(() => {
    setIsClearConfirmationOpen(false);
  }, []);
  const clearSkillTemplates = useCallback(() => {
    deleteSkillTemplates(moduleId).then(closeClearConfirmation).catch(console.error);
  }, [closeClearConfirmation, moduleId]);
  const openClearConfirmation = useCallback(() => {
    setIsClearConfirmationOpen(true);
  }, []);

  return (<div className={className}>
    {skillTemplates && skillTemplates.length > 0 && (
      <Button
        icon='trash-can'
        label={t('Clear skill templates')}
        onClick={openClearConfirmation}
      />
    )}
    {skillTemplates && skillTemplates.map((skillTemplate: SkillTemplate) => (
      <div
        className='ui--row'
        key={skillTemplate.id}
        style={{
          alignItems: 'center'
        }}
      >
        <SkillTemplateInfo skillTemplate={skillTemplate} />
      </div>
    ))}
    {isClearConfirmationOpen && (
      <Confirmation
        onClose={closeClearConfirmation}
        onConfirm={clearSkillTemplates}
        question={t('Clear all skill templates for this module?')}
      />
    )}
  </div>
  );
};

export default SkillTemplateList;
