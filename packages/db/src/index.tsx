// Copyright 2021-2022 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { db } from "./db/index.js";
import type { Agreement } from "./db/Contract.js";
import type { Letter } from "./db/Letter.js";
import type { Insurance } from "./db/Insurance.js";
import type { Signer } from "./db/Signer.js";
import type { UsageRight } from "./db/UsageRight.js";
import type { Pseudonym } from "./db/Pseudonym.js";
import type { Setting } from "./db/Setting.js";
import type { Lesson } from "./db/Lesson.js";
import DOMPurify from 'dompurify';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { isHex, u8aToHex } from '@polkadot/util';
import { blake2AsHex } from '@polkadot/util-crypto';
import "dexie-export-import";
import { InsurancesTransfer, LessonRequest } from "@slonigiraf/app-slonig-components";

export type { Letter, Insurance, Lesson, Pseudonym, Setting, Signer, UsageRight, Agreement };

export const SettingKey = {
    ACCOUNT: 'account',
    ENCRYPTION_KEY: 'encryptionKey',
    IV: 'iv',
    KNOWLEDGE: 'knowledge',
    TUTOR: 'tutor',
    LESSON: 'lesson',
    RESULTS_FOR_LESSON: 'resultsForLesson',
    DEVELOPER: 'developer',
    TEACHER: 'teacher',
    DIPLOMA_PRICE: 'diploma_price',
    DIPLOMA_WARRANTY: 'diploma_warranty',
    DIPLOMA_VALIDITY: 'diploma_validity',
};

export const QRAction = {
    NAVIGATION: 0,
    TRANSFER: 1,
    ADD_DIPLOMA: 2,
    BUY_DIPLOMAS: 3,
    TUTOR_IDENTITY: 4,
    SKILL: 5,
    TEACHER_IDENTITY: 6,
    ADD_INSURANCES: 7,
    LEARN_MODULE: 8
};

export const QRField = {
    WEBRTC_PEER_ID: 'c',
    ID: 'i',
    QR_ACTION: 'q',
    QR_SIGNATURE: 's',
    PERSON_NAME: 'n',
    PERSON_IDENTITY: 'p',
    TUTOR: 't',
    DATA: 'd',
    PRICE: 'm',
};

export const LawType = {
    LIST: 0,
    COURSE: 1,
    MODULE: 2,
    SKILL: 3,
    EXERCISE: 4
};

const progressCallback = ({ totalRows, completedRows }: any) => {
    console.log(`Progress: ${completedRows} of ${totalRows} rows completed`);
    return true;
}
export const exportDB = async () => {
    db.export({ prettyJson: true, progressCallback });
}

export const getLesson = async (id: string) => {
    return db.lessons.get(id);
}
export const getLessons = async (tutor: string, startDate: number | null, endDate: number | null) => {
    let query = db.lessons.where('tutor').equals(tutor);
    if (startDate || endDate) {
        query = query.filter((lesson) => {
            if (startDate && lesson.created < startDate) return false;
            if (endDate && lesson.created > endDate) return false;
            return true;
        });
    }
    return query.reverse().sortBy('created');
}
export const getLetter = async (id: number) => {
    return db.letters.get(id);
}
export const getAgreement = async (id: string) => {
    return db.agreements.get(id);
}

export const getInsurance = async (id: number) => {
    return db.insurances.get(id);
}
export const getLettersByLessonId = async (lessonId: string) => {
    return db.letters.where({ lesson: lessonId }).sortBy('id');
}
export const getValidLettersByLessonId = async (lessonId: string) => {
    return db.letters.where({ lesson: lessonId }).filter(letter => letter.valid).toArray();
}
export const getInsurancesByLessonId = async (lessonId: string) => {
    return db.insurances.where({ lesson: lessonId }).sortBy('id');
}

export const getAllPseudonyms = async () => {
    return db.pseudonyms.toArray();
}

export const getValidLetters = async (worker: string, startDate: number | null, endDate: number | null) => {
    let query = db.letters.where('workerId').equals(worker);
    if (startDate || endDate) {
        query = query.filter((letter: Letter) => {
            if (!letter.valid) return false;
            if (letter.letterNumber < 0) return false;
            if (startDate && letter.created < startDate) return false;
            if (endDate && letter.created > endDate) return false;
            return true;
        });
    }
    return query.reverse().sortBy('id');
}

export const getInsurances = async (employer: string, worker: string, startDate: number | null, endDate: number | null) => {
    let query = db.insurances.where('[employer+workerId]').equals([employer, worker]);
    query = query.filter((insurance: Insurance) => {
        if (startDate && insurance.created < startDate) return false;
        if (endDate && insurance.created > endDate) return false;
        return true;
    });
    return query.sortBy('id').then((insurances) => insurances.reverse());
}

export const syncDB = async (data: string, password: string) => {
    const json = JSON.parse(data);
    //letters
    const letters = getDBObjectsFromJson(json, "letters");
    letters.map((v: Letter) => putLetter(v));
    //insurances
    const insurances = getDBObjectsFromJson(json, "insurances");
    insurances.map((v: Insurance) => storeInsurance(v));
    //signers
    const signers = getDBObjectsFromJson(json, "signers");
    signers.map(async (v: Signer) => {
        const inLocal = await getLastUnusedLetterNumber(v.publicKey);
        const inParsed = v.lastLetterNumber;
        if (inParsed > inLocal) {
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
        await db.signers.add(signer);
        return initialLetterNumber;
    }
    return 1 + sameSigner.lastLetterNumber;
}

export const setLastUsedLetterNumber = async (publicKey: string, lastUsed: number) => {
    await db.signers.where({ publicKey: publicKey }).modify((v: Signer) => v.lastLetterNumber = lastUsed);
}

export const updateLetterReexaminingCount = async (signOverReceipt: string, time: number) => {
    const letter: Letter | undefined = await getLetterByLessonIdAndSignOverReceipt('', signOverReceipt);
    if(letter){
        const updatedLetter: Letter = {...letter, lastReexamined: time};
        putLetter(updatedLetter);
    }
}
export const cancelLetter = async (signOverReceipt: string, time: number) => {
    const letter: Letter | undefined = await getLetterByLessonIdAndSignOverReceipt('', signOverReceipt);
    if(letter){
        const updatedLetter: Letter = {...letter, lastReexamined: time, valid: false};
        putLetter(updatedLetter);
    }
}

export const getLetterByLessonIdAndSignOverReceipt = async (lessonKey: string, signOverReceipt: string) => {
    return await db.letters
        .where('[lesson+signOverReceipt]')
        .equals([lessonKey, signOverReceipt])
        .first();
}

export const getValidLettersForKnowledgeId = async (workerId: string, knowledgeId: string): Promise<Letter[]> => {
    return await db.letters
        .where('[workerId+knowledgeId]')
        .equals([workerId, knowledgeId])
        .filter((letter: Letter) => (letter.valid === true && letter.letterNumber >= 0))
        .toArray();
}

export const getLessonId = (tutor: string, ids: any[]): string => {
    const date = new Date().toISOString().split('T')[0]; // Get the current date in YYYY-MM-DD format
    const dataToHash = `${date}-${tutor}-${ids.join('-')}`;
    const hash = blake2AsHex(dataToHash);
    return hash;
};

export const getDataShortKey = (data: string): string => {
    const hash = blake2AsHex(data);
    return hash;
};

export const getLettersByWorkerIdWithEmptyLesson = async (workerId: string) => {
    return db.letters.where('[workerId+lesson]').equals([workerId, '']).toArray();
};

const DEFAULT_WARRANTY = "105000000000000";//105 Slon
const DEFAULT_VALIDITY = 730;//Days valid
const DEFAULT_DIPLOMA_PRICE = "80000000000000";//80 Slon

export const storeLesson = async (lessonRequest: LessonRequest) => {
    const now = (new Date()).getTime();

    const stored_warranty = await getSetting(SettingKey.DIPLOMA_WARRANTY);
    const stored_validity = await getSetting(SettingKey.DIPLOMA_VALIDITY);
    const stored_diploma_price = await getSetting(SettingKey.DIPLOMA_PRICE);

    const warranty = stored_warranty ? stored_warranty : DEFAULT_WARRANTY;
    const validity: number = stored_validity ? parseInt(stored_validity, 10) : DEFAULT_VALIDITY;
    const diploma_price = stored_diploma_price ? stored_diploma_price : DEFAULT_DIPLOMA_PRICE;

    const lesson: Lesson = {
        id: lessonRequest.lesson, 
        created: now, 
        cid: lessonRequest.cid,
        tutor: lessonRequest.tutor, 
        student: lessonRequest.identity,
        toLearnCount: lessonRequest.learn.length, 
        learnStep: 0,
        toReexamineCount: lessonRequest.reexamine.length, 
        reexamineStep: 0,
        dPrice: diploma_price, 
        dWarranty: warranty, 
        dValidity: validity,
    };

    const sameLesson = await db.lessons.get({ id: lesson.id });
    if (sameLesson === undefined) {
        await db.lessons.add(lesson);
        await Promise.all(lessonRequest.learn.map(async (item: string[]) => {
            const letter: Letter = {
                created: now,
                valid: false,
                reexamCount: 0,
                lastReexamined: now,
                lesson: lesson.id,
                workerId: lesson.student,
                knowledgeId: item[0],
                cid: item[1],
                genesis: '',
                letterNumber: -1,
                block: '',
                referee: lesson.tutor,
                worker: item[2],
                amount: '',
                signOverPrivateData: '',
                signOverReceipt: '',
            };
            return await putLetter(letter);
        }));

        await Promise.all(lessonRequest.reexamine.map(async (item: string[]) => {
            const insurance: Insurance = {
                created: now,
                lastReexamined: now,
                valid: true,
                lesson: lesson.id,
                workerId: lesson.student,
                cid: item[0],
                genesis: item[1],
                letterNumber: parseInt(item[2], 10),
                block: item[3],
                blockAllowed: item[4],
                referee: item[5],
                worker: item[6],
                amount: item[7],
                signOverPrivateData: item[8],
                signOverReceipt: item[9],
                employer: lesson.tutor,
                workerSign: item[10],
                wasUsed: false,
            };
            return await storeInsurance(insurance);
        }));
    }
    await storeSetting(SettingKey.LESSON, lessonRequest.lesson);
}

export const updateLesson = async (lesson: Lesson) => {
    const sameLesson = await db.lessons.get({ id: lesson.id });
    if (sameLesson !== undefined) {
        await db.lessons.update(lesson.id, lesson);
    }
}

export const putAgreement = async (agreement: Agreement) => {
    await db.agreements.put(agreement);
}

export const putLetter = async (letter: Letter) => {
    await db.letters.put(letter);
}

export const updateInsurance = async (insurance: Insurance) => {
    const sameItem = await db.insurances.get({ id: insurance.id });
    if (sameItem !== undefined && insurance.id) {
        await db.insurances.update(insurance.id, insurance);
    }
}

export const storeInsurance = async (insurance: Insurance) => {
    const lessonKey = insurance.lesson ?? '';
    const sameInsurance = await db.insurances
        .where('[lesson+signOverReceipt]')
        .equals([lessonKey, insurance.signOverReceipt])
        .first();
    if (sameInsurance === undefined) {
        await db.insurances.add(insurance);
    }
}

function isValidPublicKey(publicKey: string) {
    try {
        // Check if the public key is a valid hex string
        if (!isHex(publicKey)) {
            return false;
        }

        // Decode the public key to check if it's valid
        const decoded = decodeAddress(publicKey);

        // Optionally, re-encode and compare to the original
        const encoded = encodeAddress(decoded);
        return u8aToHex(decoded) === publicKey || encoded === publicKey;
    } catch (error) {
        // If an error occurs (like an invalid public key), return false
        return false;
    }
}

export const storePseudonym = async (publicKey: string, pseudonym: string) => {
    if (isValidPublicKey(publicKey)) {
        const cleanPseudonym = DOMPurify.sanitize(pseudonym);
        const samePseudonym = await db.pseudonyms.get({ publicKey: publicKey });
        if (samePseudonym === undefined) {
            const newPseudonym: Pseudonym = { publicKey: publicKey, pseudonym: cleanPseudonym, altPseudonym: "" };
            await db.pseudonyms.put(newPseudonym);
        } else if (samePseudonym.pseudonym !== cleanPseudonym) {
            await db.pseudonyms.where({ publicKey: publicKey }).modify((f: Pseudonym) => f.altPseudonym = cleanPseudonym);
        }
    }
}

export const storeSetting = async (id: string, value: string) => {
    const cleanId = DOMPurify.sanitize(id);
    const cleanValue = DOMPurify.sanitize(value);
    await db.settings.put({ id: cleanId, value: cleanValue });
}
export const deleteSetting = async (id: string) => {
    const cleanId = DOMPurify.sanitize(id);
    db.settings.delete(cleanId);
}
export const deleteLetter = async (id: number) => {
    db.letters.delete(id);
}
export const deleteInsurance = async (id: number) => {
    db.insurances.delete(id);
}
export const deleteLesson = async (id: string) => {
    db.lessons.delete(id);
}
export const getSetting = async (id: string): Promise<string | undefined> => {
    const cleanId = DOMPurify.sanitize(id);
    const setting = await db.settings.get(cleanId);
    return setting ? setting.value : undefined;
};

export const storeUsageRight = async (usageRight: UsageRight) => {
    const sameUsageRight = await db.usageRights.get({ sign: usageRight.sign });
    if (sameUsageRight === undefined) {
        await db.usageRights.add(usageRight);
    }
}

export const storeLetterUsageRight = async (letter: Letter, employer: string, sign: string) => {
    const sameUsageRight = await db.usageRights.get({ sign: sign });
    if (sameUsageRight === undefined && letter.signOverReceipt !== undefined) {
        const usageRight = {
            created: (new Date()).getTime(),
            signOverReceipt: letter.signOverReceipt,
            employer: employer,
            sign: sign
        };
        await db.usageRights.add(usageRight);
    }
}

export const createAndStoreLetter = async (data: string[]) => {
    const [textHash,
        workerId,
        genesisHex,
        letterId,
        blockNumber,
        refereePublicKeyHex,
        workerPublicKeyHex,
        amount,
        refereeSignOverPrivateData,
        refereeSignOverReceipt,
        knowledgeId] = data;

    const now = (new Date()).getTime();
    const letter: Letter = {
        created: now,
        valid: true,
        reexamCount: 0,
        lastReexamined: now,
        lesson: '',
        workerId: workerId,
        knowledgeId: knowledgeId,
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
    await putLetter(letter);
}

export const storeInsurances = async (insurancesTransfer: InsurancesTransfer) => {
    if (Array.isArray(insurancesTransfer.insurances) && insurancesTransfer.insurances.length > 0) {
        for (let i = insurancesTransfer.insurances.length - 1; i >= 0; i--) {
            const insuranceDataString = insurancesTransfer.insurances[i];
            const insuranceDataArray = insuranceDataString.split(",");
            insuranceDataArray.unshift(insurancesTransfer.identity, insurancesTransfer.employer);
            await createAndStoreInsurance(insuranceDataArray);
        }
    } else {
        console.error("Invalid or empty insurances data.");
    }
};

const createAndStoreInsurance = async (data: string[]) => {
    const [
        workerId,
        employerPublicKeyHex,
        worker,
        textHash,
        genesisHex,
        letterId,
        blockNumber,
        blockAllowed,
        refereePublicKeyHex,
        amountValue,
        refereeSignOverPrivateData,
        refereeSignOverReceipt,
        workerSignOverInsurance] = data;

    const now = (new Date()).getTime();

    const insurance: Insurance = {
        created: now,
        lastReexamined: now,
        valid: true,
        lesson: '',
        workerId: workerId,
        cid: textHash,
        genesis: genesisHex,
        letterNumber: parseInt(letterId, 10),
        block: blockNumber,
        blockAllowed: blockAllowed,
        referee: refereePublicKeyHex,
        worker: worker,
        amount: amountValue,
        signOverPrivateData: refereeSignOverPrivateData,
        signOverReceipt: refereeSignOverReceipt,
        employer: employerPublicKeyHex,
        workerSign: workerSignOverInsurance,
        wasUsed: false
    };
    await storeInsurance(insurance);
}

export const getPseudonym = async (publicKey: string): Promise<string | undefined> => {
    try {
        const name = await db.pseudonyms.get(publicKey);
        if (name && typeof name.pseudonym === 'string') {
            const pseudonym = name.pseudonym;
            return DOMPurify.sanitize(pseudonym);
        }
    } catch (error) {
        console.error('Error fetching pseudonym:', error);
    }
    return undefined;
};


/**
 * Serializes a Letter object to a JSON string, including only the specified fields.
 * @param letter - The Letter object to serialize.
 * @returns The JSON string representation of the Letter.
 */
export function serializeLetter(letter: Letter): string {
    // Create an array with values in a specific order
    const serializedArray = [
        letter.lastReexamined, // It's intentionally done, that first element here is not match the first element in deserializeLetter
        letter.knowledgeId,
        letter.cid,
        letter.letterNumber.toString(),
        letter.block,
        letter.referee,
        letter.worker,
        letter.signOverPrivateData,
        letter.signOverReceipt
    ];
    return serializedArray.join(",");
}

/**
* Deserializes a JSON string to a Letter object, including only the specified fields.
* Extra fields in the JSON are ignored.
* @param jsonString - The JSON string to deserialize.
* @returns The Letter object parsed from the JSON string.
* @throws Will throw an error if the JSON is invalid or missing required fields.
*/
export function deserializeLetter(data: string, workerId: string, genesis: string, amount: string): Letter {
    const [
        created,
        knowledgeId,
        cid,
        letterNumber,
        block,
        referee,
        worker,
        signOverPrivateData,
        signOverReceipt,
    ] = data.split(',');

    const timeStamp = parseInt(created,10);

    const result: Letter = {
        created: timeStamp,
        valid: true,
        reexamCount: 0,
        lastReexamined: timeStamp,
        lesson: '',
        workerId,
        knowledgeId,
        cid,
        genesis,
        letterNumber: parseInt(letterNumber,10),
        block,
        referee,
        worker,
        amount,
        signOverPrivateData,
        signOverReceipt
    };
    return result;
}  