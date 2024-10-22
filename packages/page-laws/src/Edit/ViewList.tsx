import React, { useCallback, useEffect, useState } from 'react';
import { KatexSpan, LawType, getCIDFromBytes, getIPFSDataFromContentID, parseJson, SelectableList } from '@slonigiraf/app-slonig-components';
import { useApi } from '@polkadot/react-hooks';
import { BN_ZERO } from '@polkadot/util';
import ItemLabel from './ItemLabel.js';
import SkillQR from './SkillQR.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import { useTranslation } from '../translate.js';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import ExerciseList from './ExerciseList.js';
import { u8aToHex } from '@polkadot/util';
import LearnWithAI from './LearnWithAI.js';
import { Toggle } from '@polkadot/react-components';
import { ItemWithCID } from '../types.js';

interface Props {
  className?: string;
  id: string;
  currentPair: KeyringPair | null;
}

function ViewList({ className = '', id, currentPair }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();
  type JsonType = { [key: string]: any } | null;
  const [list, setList] = useState<JsonType>(null);
  const [text, setText] = useState<string>("");
  const [cidString, setCidString] = useState<string>(null);
  const [lawHexData, setLawHexData] = useState('');
  const [amountList, setAmountList] = useState<BN>(BN_ZERO);
  const [previousAmount, setPreviousAmount] = useState<BN>(BN_ZERO);
  const { api } = useApi();
  const [isLearningRequested, setLearningRequested] = useState(false);
  const [isReexaminingRequested, setReexaminingRequested] = useState(false);
  const [isThereAnythingToReexamine, setIsThereAnythingToReexamine] = useState(false);
  const [isThereAnythingToLearn, setIsThereAnythingToLearn] = useState(false);
  const [selectedItems, setSelectedItems] = useState<ItemWithCID[]>([]);

  async function fetchLaw(key: string) {
    if (key) {
      const law = await api.query.laws.laws(key);
      if (law.isSome) {
        const tuple = law.unwrap();
        const byteArray = tuple[0]; // This should give you the [u8; 32]
        const bigIntValue = tuple[1]; // This should give you the u128
        const cid = await getCIDFromBytes(byteArray);
        setCidString(cid);
        setLawHexData(u8aToHex(byteArray));
        setAmountList(bigIntValue);
        setPreviousAmount(bigIntValue);
        setLearningRequested(false);
        setReexaminingRequested(false);
        setSelectedItems([]);
      }
    }
  }

  useEffect(() => {
    fetchLaw(id);
  }, [id]);

  useEffect(() => {
    const fetchIPFSData = async () => {
      if (!isIpfsReady || cidString == null) {
        return;
      }
      const textValue = await getIPFSDataFromContentID(ipfs, cidString);
      setText(textValue);
      setList(parseJson(textValue));
    };

    fetchIPFSData();
  }, [cidString, ipfs]);

  const handleLearningToggle = useCallback((checked: boolean): void => {
    setLearningRequested(checked);
    if (checked) {
      setReexaminingRequested(false);
    }
  }, []);

  const handleReexaminingToggle = useCallback((checked: boolean): void => {
    setReexaminingRequested(checked);
    if (checked) {
      setLearningRequested(false);
    }
  }, []);

  const isModuleQRVisible = isLearningRequested || isReexaminingRequested;

  const handleSelectionChange = (newSelectedItems: ItemWithCID[]) => {
    setSelectedItems(newSelectedItems);
  };

  const handleItemsUpdate = useCallback((items: ItemWithCID[]): void => {
    if (items.length > 0) {
      // Check if all of the selectedItems have valid diplomas
      const allHaveValidDiplomas = items.every(item => item.validDiplomas && item.validDiplomas.length > 0);
      if (allHaveValidDiplomas) {
        setIsThereAnythingToLearn(false);
      } else {
        // Optionally handle cases where not all items have valid diplomas
        setIsThereAnythingToLearn(true);
      }
      // Check if none of the selectedItems have valid diplomas
      const noValidDiplomas = items.every(item => !item.validDiplomas || item.validDiplomas.length === 0);
      if (noValidDiplomas) {
        setIsThereAnythingToReexamine(false);
        setReexaminingRequested(false);
      } else {
        setIsThereAnythingToReexamine(true);
      }
    }
  }, [setIsThereAnythingToReexamine, setReexaminingRequested, setIsThereAnythingToReexamine]);
  const isSelectionAllowed = true;

  return list == null ? <></> : (
    <>
      <h1><KatexSpan content={list.h} /></h1>
      {list.t !== null && list.t === LawType.MODULE && (
        <>
          {isThereAnythingToLearn && <Toggle
            label={t('Learn with a tutor')}
            onChange={handleLearningToggle}
            value={isLearningRequested}
          />}
          {isThereAnythingToReexamine && <Toggle
            label={t('Reexamine my diplomas')}
            onChange={handleReexaminingToggle}
            value={isReexaminingRequested}
          />}
          <div className='ui--row' style={isModuleQRVisible ? {} : { display: 'none' }}>
            <SkillQR id={id} cid={cidString} type={LawType.MODULE} selectedItems={selectedItems} isLearningRequested={isLearningRequested} isReexaminingRequested={isReexaminingRequested} />
          </div>
        </>
      )}
      {list.t !== null && list.t === LawType.SKILL && (
        <>
          <SkillQR id={id} cid={cidString} type={LawType.SKILL} selectedItems={[{ 'id': id, 'cid': cidString, 'validDiplomas': [] }]} isLearningRequested={true} />
          <LearnWithAI skillName={list.h} exercises={list.q} />
          <h3>{t('Example exercises to train the skill')}</h3>
        </>
      )}

      {list.e != null && (
        <SelectableList<ItemWithCID>
          items={list.e.map((id: string) => ({
            id: id,
            cid: ''
          }))}
          renderItem={(item, isSelected, isSelectionAllowed, onToggleSelection, handleItemUpdate) => (
            <ItemLabel
              id={item.id}
              isSelected={isSelected}
              isReexaminingRequested={isReexaminingRequested}
              onToggleSelection={onToggleSelection}
              isSelectable={isModuleQRVisible}
              onItemUpdate={handleItemUpdate}
            />
          )}
          onSelectionChange={handleSelectionChange}
          onItemsUpdate={handleItemsUpdate}
          isSelectionAllowed={isModuleQRVisible}
          keyExtractor={(item) => item.id}
          key={id}
        />
      )}

      {list.q != null && <ExerciseList exercises={list.q} />}
    </>
  );
}

export default React.memo(ViewList);