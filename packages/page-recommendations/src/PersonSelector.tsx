// PersonSelector.tsx
import React from 'react';
import { Dropdown } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { getAllPseudonyms, type Pseudonym } from '@slonigiraf/db';

interface PersonSelectorProps {
    className?: string;
    label: string;
    onChange: (selectedKey: string) => void;
}

const PersonSelector: React.FC<PersonSelectorProps> = ({ className, label, onChange }) => {
    const person = useLiveQuery(() => getAllPseudonyms(), []);
    let options = person?.map((p: Pseudonym) => ({
        text: p.pseudonym,
        value: p.publicKey
    }));

    return (
        <Dropdown
            className={`dropdown ${className}`}
            label={label}
            value={''}
            onChange={onChange}
            options={options || []}
        />
    );
};

export default React.memo(PersonSelector);
