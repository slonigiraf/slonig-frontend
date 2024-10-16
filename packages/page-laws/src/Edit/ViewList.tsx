import React, { useCallback, useEffect, useState } from 'react';
import { KatexSpan, LawType, getCIDFromBytes, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
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

  const isModuleQRVisible = (isLearningRequested || isReexaminingRequested);

  return (
    list == null ? <></> :
      <>
        <h1><KatexSpan content={list.h} /></h1>
        {
          list.t !== null && list.t === LawType.MODULE &&
          <>
            <Toggle
              label={t('Learn with a tutor')}
              onChange={handleLearningToggle}
              value={isLearningRequested}
            />
            <Toggle
              label={t('Reexamine my diplomas')}
              onChange={handleReexaminingToggle}
              value={isReexaminingRequested}
            />
            <div className='ui--row' style={isModuleQRVisible ? {} : { display: 'none' }}>
              <SkillQR id={id} cid={cidString} type={LawType.MODULE} />
            </div>
          </>
        }
        {
          list.t !== null && list.t === LawType.SKILL &&
          <>
            <SkillQR id={id} cid={cidString} type={LawType.SKILL} />
            <LearnWithAI skillName={list.h} exercises={list.q} />
            <h3>{t('Example exercises to train the skill')}</h3>
          </>
        }
        {list.e != null && list.e.map((item: string) => (
          <div className='ui--row' key={item}
            style={{
              alignItems: 'center'
            }}
          >
            <ItemLabel id={item} />
          </div>
        ))}
        {list.q != null && <ExerciseList exercises={list.q} />}
      </>
  );
};

export default React.memo(ViewList);