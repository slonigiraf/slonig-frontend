// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, {
  useCallback,
  useImperativeHandle,
  useState,
  forwardRef
} from 'react';
import BN from 'bn.js';
import { styled, Button, InputBalance } from '@polkadot/react-components';
import { BN_ZERO } from '@polkadot/util';
import { useInfo, FullscreenActivity, useLog, bnToSlonFloatOrNaN } from '@slonigiraf/slonig-components';
import { Lesson } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { warrantyFromPrice } from '../utils.js';

export type LessonTradeHandle = {
  saveLessonSettings: () => Promise<void>;
};

interface Props {
  className?: string;
  lesson: Lesson | null;
  updateAndStoreLesson: (lesson: Lesson | null) => Promise<void>;
  onClose: () => void;
  onFinished: () => void;
}

function LessonTradeImpl(
  { className = '', lesson, updateAndStoreLesson, onFinished }: Props,
  ref: React.ForwardedRef<LessonTradeHandle>
): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const { showInfo } = useInfo();

  const [priceInputValue, setPriceInputValue] = useState<BN>(lesson ? new BN(lesson.dPrice) : BN_ZERO);
  const [amountInputValue, setAmountInputValue] = useState<BN>(lesson ? new BN(lesson.dWarranty) : BN_ZERO);

  const setPriceInput = useCallback(async (value?: BN): Promise<void> => {
    if (!value) return;
    setPriceInputValue(value);
    setAmountInputValue(await warrantyFromPrice(value));
  }, []);

  const saveLessonSettings = useCallback(async (): Promise<void> => {
    if (!amountInputValue || amountInputValue.eq(BN_ZERO)) {
      showInfo(t('Correct the errors highlighted in red'), 'error');
      return;
    }

    if (!lesson) return;

    if (priceInputValue.toString() !== lesson.dPrice) {
      logEvent('SETTINGS', 'DIPLOMA_PRICE_SET', 'diploma_price_set_to_slon', bnToSlonFloatOrNaN(priceInputValue));
    }
    if (amountInputValue.toString() !== lesson.dWarranty) {
      logEvent('SETTINGS', 'DIPLOMA_WARRANTY_SET', 'diploma_warranty_set_to_slon', bnToSlonFloatOrNaN(amountInputValue));
    }

    const updatedLesson: Lesson = {
      ...lesson,
      dPrice: priceInputValue.toString(),
      dWarranty: amountInputValue.toString(),
    };

    await updateAndStoreLesson(updatedLesson);
  }, [amountInputValue, lesson, logEvent, priceInputValue, showInfo, t, updateAndStoreLesson]);

  // expose method to parent
  useImperativeHandle(ref, () => ({ saveLessonSettings }), [saveLessonSettings]);

  return (
    <FullscreenActivity caption={''}>
      <WarrantyAndDays>
        <label>{bnToSlonFloatOrNaN(amountInputValue) + ' Slon - ' + t('stake for each badge')}</label>
        <label>{lesson && lesson.dValidity.toString() + ' ' + t('days valid')}</label>
      </WarrantyAndDays>

      <InputDiv>
        <div className='ui--row'>
          <InputBalance
            isZeroable
            label={t('my reward per badge')}
            onChange={setPriceInput}
            defaultValue={lesson ? new BN(lesson.dPrice) : BN_ZERO}
          />
        </div>
      </InputDiv>

      <Button label={t('We traded')} onClick={saveLessonSettings} />
    </FullscreenActivity>
  );
}

const LessonTrade = React.memo(forwardRef<LessonTradeHandle, Props>(LessonTradeImpl));
export default LessonTrade;

const InputDiv = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 85%;
`;

const WarrantyAndDays = styled.div`
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  padding-left: 75px;
`;