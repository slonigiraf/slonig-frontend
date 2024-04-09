import React, { useState, useEffect } from 'react';
import { useLoginContext } from '@slonigiraf/app-slonig-components';
import { Letter, getValidLetters } from '@slonigiraf/app-recommendations';
import { Icon } from '@polkadot/react-components';
import { u8aToHex } from '@polkadot/util';

interface Props {
  className?: string;
  cid: string;
  caption?: string;
  setValidDiplomas?: (letters: Letter[]) => void;
  onLoad?: () => void;
}

function DiplomaCheck({ className = '', cid, caption, setValidDiplomas, onLoad }: Props): React.ReactElement<Props> {
  const { currentPair, isLoggedIn } = useLoginContext();
  const [studentHasValidDiplomaForThisSkill, setStudentHasValidDiplomaForThisSkill] = useState<boolean>(false);
  const studentIdentity = u8aToHex(currentPair?.publicKey);

  useEffect(() => {
    const fetchDiplomaForTheSkill = async () => {
      const allDiplomas = await getValidLetters(studentIdentity, cid);
      if (allDiplomas.length > 0) {
        setStudentHasValidDiplomaForThisSkill(true);
      }
      setValidDiplomas && setValidDiplomas(allDiplomas);
      onLoad && onLoad();
    };
    fetchDiplomaForTheSkill();
  }, [studentIdentity, cid]);

  return (
    <span>
      {studentHasValidDiplomaForThisSkill ? <><Icon icon={'check'} />&nbsp;{caption}</> : null}
    </span>
  );
}
export default React.memo(DiplomaCheck);