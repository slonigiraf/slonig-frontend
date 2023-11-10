// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { db } from "./db";
import { Letter } from "./db/Letter";
import { Insurance } from "./db/Insurance";
import { Signer } from "./db/Signer";
import { UsageRight } from "./db/UsageRight";

export const syncDB = async (data: string, password: string) => {
    const json = JSON.parse(data);
    //letters
    const letters = getDBObjectsFromJson(json, "letters");
    letters.map((v: Letter) => storeLetter(v));
    //insurances
    const insurances = getDBObjectsFromJson(json, "insurances");
    insurances.map((v: Insurance) => storeInsurance(v));
    //signers
    const signers = getDBObjectsFromJson(json, "signers");
    signers.map(async (v: Signer) => { 
        const inLocal = await getLastUnusedLetterNumber(v.publicKey);
        const inParsed = v.lastLetterNumber;
        if(inParsed > inLocal){
            setLastUsedLetterNumber(v.publicKey, inParsed);
        }
    });
    //usageRights
    const usageRights = getDBObjectsFromJson(json, "usageRights");
    usageRights.map((v: UsageRight) => storeUsageRight(v));
    //TODO: implement for pseudonyms
}

export const getDBObjectsFromJson = (json: any, tableName: string) => {
    const found = json.data.data.find((element: { tableName: string; }) => element.tableName === tableName);
    return found.rows;
}

export const getLastUnusedLetterNumber = async (publicKey: string) => {
    const sameSigner = await db.signers.get({ publicKey: publicKey });
    if (sameSigner === undefined) {
        const initialLetterNumber = 0;
        const signer = {
            publicKey: publicKey,
            lastLetterNumber: initialLetterNumber
        }
        db.signers.add(signer);
        return initialLetterNumber;
    }
    return 1 + sameSigner.lastLetterNumber;
}

export const setLastUsedLetterNumber = async (publicKey: string, lastUsed: number) => {
    db.signers.where({ publicKey: publicKey }).modify((v) => v.lastLetterNumber = lastUsed);
}

export const storeLetter = async (letter: Letter) => {
    const sameLatter = await db.letters.get({ signOverReceipt: letter.signOverReceipt });
    if (sameLatter === undefined) {
        db.letters.add(letter);
    }
}

export const storeInsurance = async (insurance: Insurance) => {
    const sameInsurance = await db.insurances.get({ workerSign: insurance.workerSign });
    if (sameInsurance === undefined) {
        db.insurances.add(insurance);
    } else if(sameInsurance.wasUsed === false && insurance.wasUsed === true){
        db.insurances.where({ id: insurance.id }).modify((f) => f.wasUsed = true);
    }
}

export const storeUsageRight = async (usageRight: UsageRight) => {
    const sameUsageRight = await db.usageRights.get({ sign: usageRight.sign });
    if (sameUsageRight === undefined ) {
        db.usageRights.add(usageRight);
    }
}

export const storeLetterUsageRight = async (letter: Letter, employer: string, sign: string) => {
    const sameUsageRight = await db.usageRights.get({ sign: sign });
    if (sameUsageRight === undefined && letter.signOverReceipt !== undefined) {
        const usageRight = {
            created: new Date(),
            signOverReceipt: letter.signOverReceipt,
            employer: employer,
            sign: sign
        };
        db.usageRights.add(usageRight);
    }
}

export const createAndStoreLetter = async (data: string[]) => {
    const [textHash,
      genesisHex,
      letterId,
      blockNumber,
      refereePublicKeyHex,
      workerPublicKeyHex,
      amount,
      refereeSignOverPrivateData,
      refereeSignOverReceipt] = data;
  
    const letter = {
      created: new Date(),
      cid: textHash,
      genesis: genesisHex,
      letterNumber: parseInt(letterId, 10),
      block: blockNumber,
      referee: refereePublicKeyHex,
      worker: workerPublicKeyHex,
      amount: amount,
      signOverPrivateData: refereeSignOverPrivateData,
      signOverReceipt: refereeSignOverReceipt
    };
    await storeLetter(letter);
  }

  export const storeInsurances = async (jsonData: any) => {
    // Check if jsonData.d is an array and has elements
    if (Array.isArray(jsonData.d) && jsonData.d.length > 0) {
        // Get the worker and employer public key hex values from jsonData
        const workerPublicKeyHex = jsonData.s;
        const employerPublicKeyHex = jsonData.t;

        // Process each insurance data string
        for (const insuranceDataString of jsonData.d) {
            // Split the insurance data string into an array
            const insuranceDataArray = insuranceDataString.split(",");

            // Add worker and employer public key hex to the start of the array
            insuranceDataArray.unshift(workerPublicKeyHex, employerPublicKeyHex);

            // Use createAndStoreInsurance for each insurance
            await createAndStoreInsurance(insuranceDataArray);
        }
    } else {
        console.error("Invalid or empty insurances data.");
    }
};

const createAndStoreInsurance = async (data: string[]) => {
    const [
      workerPublicKeyHex,
      employerPublicKeyHex,
      textHash,
      genesisHex,
      letterId,
      blockNumber,
      refereePublicKeyHex,
      amountValue,
      refereeSignOverPrivateData,
      refereeSignOverReceipt,
      workerSignOverInsurance] = data;
    
    const insurance = {
      created: new Date(),
      cid: textHash,
      genesis: genesisHex,
      letterNumber: parseInt(letterId, 10),
      block: blockNumber,
      referee: refereePublicKeyHex,
      worker: workerPublicKeyHex,
      amount: amountValue,
      signOverPrivateData: refereeSignOverPrivateData,
      signOverReceipt: refereeSignOverReceipt,
      employer: employerPublicKeyHex,
      workerSign: workerSignOverInsurance,
      wasUsed: false
    };
    storeInsurance(insurance);
}