// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect } from 'react';
import InsurancesList from './InsurancesList.js';
import { IPFS } from 'ipfs-core';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { useLocation } from 'react-router-dom';
import { QRWithShareAndCopy, nameFromKeyringPair, getBaseUrl, QRAction, parseJson, useLoginContext, LoginButton, AppContainer, CenterQRContainer, receiveWebRTCData, useInfo } from '@slonigiraf/app-slonig-components';
import { storeInsurances, storePseudonym } from '../utils.js';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function Teacher({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { showInfo, hideInfo } = useInfo();
  // Initialize account
  const { currentPair, isLoggedIn } = useLoginContext();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const student = queryParams.get("student");
  const studentNameFromUrl = queryParams.get("name");
  const teacherFromUrl = queryParams.get("t");
  const diplomasFromUrl = queryParams.get("d");
  const connectionFromUrl = queryParams.get("c");

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const isDedicatedTeacher = (teacherFromUrl === publicKeyHex) || !teacherFromUrl;
  const name = nameFromKeyringPair(currentPair);
  const qrData = {
    q: QRAction.TEACHER_IDENTITY,
    n: name,
    p: publicKeyHex,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url = getBaseUrl() + `/#/diplomas?teacher=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  // Save student pseudonym from url
  useEffect(() => {
    if (student && studentNameFromUrl) {
      async function savePseudonym() {
        try {
          // Ensure that both teacherPublicKey and teacherName are strings
          if (typeof student === 'string' && typeof studentNameFromUrl === 'string') {
            await storePseudonym(student, studentNameFromUrl);
            // setStudentName(studentNameFromUrl);
          }
        } catch (error) {
          console.error("Failed to save teacher pseudonym:", error);
        }
      }
      savePseudonym();
    }
  }, [student, studentNameFromUrl]);



  // Save insurances from url
  useEffect(() => {
    if (connectionFromUrl && isDedicatedTeacher) {
      async function saveDiplomas() {
        if (connectionFromUrl) {
          showInfo(t('Loading'), 'info', 60)
          const diplomasFromUrl = await receiveWebRTCData(connectionFromUrl);
          hideInfo();
          const dimplomasJson = parseJson(diplomasFromUrl);
          try {
            const dimplomasJsonWithMeta = {
              q: QRAction.SELL_DIPLOMAS,
              p: student,
              n: studentNameFromUrl,
              t: publicKeyHex,
              d: dimplomasJson
            };
            await storeInsurances(dimplomasJsonWithMeta);
          } catch (error) {
            console.error("Failed to save diplomas:", error);
          }
        }
      }
      saveDiplomas();
    }
  }, [diplomasFromUrl, isDedicatedTeacher]);

  return (
    <div className={`toolbox--Student ${className}`}>
      {
        isLoggedIn && <>
          {(!student || !isDedicatedTeacher) &&
            <CenterQRContainer>
              {
                isDedicatedTeacher ? (
                  <h2>{t('Show to a student to see their results')}</h2>
                ) : (
                  <h2>{t('Student has shown you a QR code created for a different teacher. Ask them to scan your QR code.')}</h2>
                )
              }
              <QRWithShareAndCopy
                dataQR={qrCodeText}
                titleShare={t('QR code')}
                textShare={t('Press the link to show diplomas')}
                urlShare={url}
                dataCopy={url} />
            </CenterQRContainer>
          }
          {
            student && isDedicatedTeacher && (
              <div className='ui--row'>
                <InsurancesList ipfs={ipfs} teacher={u8aToHex(currentPair?.publicKey)} student={student} studentNameFromUrl={studentNameFromUrl} />
              </div>
            )
          }

        </>
      }
      <LoginButton label={t('Log in')} />
    </div>
  );

}

export default React.memo(Teacher);