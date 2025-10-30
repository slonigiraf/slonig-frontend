import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSkillTemplates } from '@slonigiraf/db';
import { SkillTemplate } from 'db/src/db/SkillTemplate.js';
import SkillTemplateInfo from './SkillTemplateInfo.js';

interface Props {
    className?: string;
    moduleId: string;
}

const SkillTemplateList: React.FC<Props> = ({ className = '', moduleId }: Props) => {
    const skillTemplates = useLiveQuery(() => getSkillTemplates(moduleId), [moduleId]);
    return (<>
        {skillTemplates && skillTemplates.map((skillTemplate: SkillTemplate, index) => (
            <div className='ui--row' key={skillTemplate.id}
                style={{
                    alignItems: 'center'
                }}
            >
                <SkillTemplateInfo skillTemplate={skillTemplate} />
            </div>
        ))}
    </>
    );
}


export default SkillTemplateList;