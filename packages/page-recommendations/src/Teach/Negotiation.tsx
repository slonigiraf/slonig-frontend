// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import BN from 'bn.js';
import type { DeriveBalancesAll } from '@polkadot/api-derive/types';
import { styled, Button, InputBalance } from '@polkadot/react-components';
import { BN_HUNDRED, BN_ZERO, nextTick } from '@polkadot/util';
import { useInfo, FullscreenActivity, useLog, bnToSlonFloatOrNaN, useLoginContext } from '@slonigiraf/slonig-components';
import { Lesson } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { warrantyFromPrice } from '../utils.js';
import { useApi, useCall } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  lesson: Lesson | null;
  updateAndStoreLesson: (lesson: Lesson | null) => Promise<void>;
  onClose: () => void;
}

function Negotiation({ className = '', lesson, updateAndStoreLesson, onClose }: Props): React.ReactElement<Props> {
  const { api } = useApi();
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const [priceInputValue, setPriceInputValue] = useState<BN>(lesson ? new BN(lesson.dPrice) : BN_ZERO);
  const [amountInputValue, setAmountInputValue] = useState<BN>(lesson ? new BN(lesson.dWarranty) : BN_ZERO);
  const { currentPair } = useLoginContext();
  const balances = useCall<DeriveBalancesAll>(api.derive.balances?.all, [currentPair?.address]);
  const [[maxTransfer, noFees], setMaxTransfer] = useState<[BN | null, boolean]>([null, false]);
  const { showInfo } = useInfo();

  useEffect((): void => {
    const fromId = currentPair?.address as string;
    const toId = currentPair?.address as string;

    if (balances && balances.accountId?.eq(fromId) && fromId && toId && api.call.transactionPaymentApi && api.tx.balances) {
      nextTick(async (): Promise<void> => {
        try {
          const extrinsic = api.tx.balances.transfer(toId, balances.availableBalance);
          const { partialFee } = await extrinsic.paymentInfo(fromId);
          const adjFee = partialFee.muln(110).div(BN_HUNDRED);
          const maxTransfer = balances.availableBalance.sub(adjFee);

          setMaxTransfer(
            api.consts.balances && maxTransfer.gt(api.consts.balances.existentialDeposit)
              ? [maxTransfer, false]
              : [null, true]
          );
        } catch (error) {
          console.error(error);
        }
      });
    } else {
      setMaxTransfer([null, false]);
    }
  }, [api, balances]);

  const setPriceInput = useCallback(async (value?: BN | undefined) => {
    if (value) {
      setPriceInputValue(value);
      setAmountInputValue(await warrantyFromPrice(value));
    }
  }, [setPriceInputValue, setAmountInputValue, warrantyFromPrice]);


  const saveLessonSettings = useCallback(async (): Promise<void> => {
    if (!amountInputValue || amountInputValue.eq(BN_ZERO)) {
      showInfo(t('Correct the errors highlighted in red'), 'error');
    } else {
      if (lesson) {
        if (priceInputValue.toString() !== lesson.dPrice) {
          logEvent('SETTINGS', 'DIPLOMA_PRICE_SET', 'diploma_price_set_to_slon', bnToSlonFloatOrNaN(priceInputValue));
        }
        if (amountInputValue.toString() !== lesson.dWarranty) {
          logEvent('SETTINGS', 'DIPLOMA_WARRANTY_SET', 'diploma_warranty_set_to_slon', bnToSlonFloatOrNaN(amountInputValue))
        }
        const updatedLesson: Lesson = {
          ...lesson,
          dPrice: priceInputValue.toString(),
          dWarranty: amountInputValue.toString(),
          wasPriceDiscussed: true,
        };
        await updateAndStoreLesson(updatedLesson);
      }
    }
  }, [priceInputValue, amountInputValue, updateAndStoreLesson]);

  return (
    <FullscreenActivity caption={''} onClose={onClose}>
      <StyledDiv>
        <h1>{t('Make a deal with your student on how much they will pay you for teaching one skill and issuing a skill badge.')}</h1>
        <InputDiv>
          <div className='ui--row'>
            <InputBalance
              isZeroable
              label={t('my reward per badge')}
              onChange={setPriceInput}
              defaultValue={lesson ? new BN(lesson.dPrice) : BN_ZERO}
            />
          </div>

          <span>
            {t('I will lose {{amount}} Slon if I issue a badge too early and the student forgets the skill.', {replace: {amount: bnToSlonFloatOrNaN(amountInputValue)}}) +
              (!maxTransfer ? '' : ' ' + t('I have {{balance}} Slon now.', { replace: { balance: bnToSlonFloatOrNaN(maxTransfer ? maxTransfer : BN_ZERO) } }))
            }
          </span>

        </InputDiv>
        <Button className={'highlighted--button'} label={t('We negotiated')} onClick={saveLessonSettings} />
      </StyledDiv>
    </FullscreenActivity>
  );
}

const StyledDiv = styled.div`
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  h1 {
    margin-top: 0px;
    margin-bottom: 0px;
    padding-left: 20px;
    padding-right: 20px;
  }
`;

const InputDiv = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  width: 90%;
  span {
    padding-left: 50px;
    padding-right: 20px;
    opacity: 0.50;
  }
`;

export default React.memo(Negotiation);