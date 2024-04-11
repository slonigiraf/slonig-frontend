import React, { useState, useEffect } from 'react';
import { useLoginContext } from '@slonigiraf/app-slonig-components';
import { Letter, getSimmilarValidLetters, getValidLetters } from '@slonigiraf/app-recommendations';
import { Icon } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';

interface Props {
  className?: string;
  id: string;
  cid: string;
  caption?: string;
  setValidDiplomas?: (letters: Letter[]) => void;
  onLoad?: () => void;
}

function DiplomaCheck({ className = '', id, cid, caption, setValidDiplomas, onLoad }: Props): React.ReactElement<Props> {
  const { currentPair, isLoggedIn } = useLoginContext();
  const [studentHasValidDiplomaForThisSkill, setStudentHasValidDiplomaForThisSkill] = useState<boolean>(false);
  const studentIdentity = u8aToHex(currentPair?.publicKey);

  useEffect(() => {
    const fetchDiplomaForTheSkill = async () => {
      const validDiplomas = await getValidLetters(studentIdentity, cid);
      const validSimilarDiplomas = await getSimmilarValidLetters(studentIdentity, id);
      const mergedDiplomas = [...validDiplomas, ...validSimilarDiplomas];
      if (mergedDiplomas.length > 0) {
        setStudentHasValidDiplomaForThisSkill(true);
      }
      setValidDiplomas && setValidDiplomas(mergedDiplomas);
      onLoad && onLoad();
    };
    fetchDiplomaForTheSkill();
  }, [studentIdentity, cid]);

  const icon = studentHasValidDiplomaForThisSkill ? 'check' : 'lightbulb';

  return (
    <span>
      {<><Icon icon={icon} color='gray'/>&nbsp;{caption}</>}
    </span>
  );
}
export default React.memo(DiplomaCheck);