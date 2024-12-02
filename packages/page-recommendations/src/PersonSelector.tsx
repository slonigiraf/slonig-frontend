// PersonSelector.tsx
import React from 'react';
import { Dropdown, styled } from '@polkadot/react-components';
import { useLiveQuery } from "dexie-react-hooks";
import { getAllPseudonyms, type Pseudonym } from '@slonigiraf/db';
import { qrWidthPx } from '@slonigiraf/app-slonig-components';

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
        <StyledDiv>
            <Dropdown
                className={`dropdown ${className}`}
                label={label}
                value={''}
                onChange={onChange}
                options={options || []}
            />
        </StyledDiv>
    );
};
const StyledDiv = styled.div`
  justify-content: center;
  align-items: center;
  width: 100%;
  .ui--Dropdown {
    width: 100%;
    padding-left: 0px !important;
  }
  label {
    left: 20px !important;
  }
`;
export default React.memo(PersonSelector);
