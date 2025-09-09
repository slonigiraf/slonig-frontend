// Copyright 2021-2022 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { db } from "./db/index.js";
import type { Agreement } from "./db/Agreement.js";
import type { LetterTemplate } from "./db/LetterTemplate.js";
import type { Letter } from "./db/Letter.js";
import type { CanceledLetter } from './db/CanceledLetter.js';
import type { Insurance } from "./db/Insurance.js";
import type { Reimbursement } from "./db/Reimbursement.js";
import type { Reexamination } from './db/Reexamination.js';
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
import { exportDB as dexieExport } from 'dexie-export-import';
import { InsurancesTransfer, LessonRequest } from "@slonigiraf/app-slonig-components";
import { CanceledInsurance } from "./db/CanceledInsurance.js";

export type { CanceledInsurance, Reexamination, LetterTemplate, CanceledLetter, Reimbursement, Letter, Insurance, Lesson, Pseudonym, Setting, Signer, UsageRight, Agreement };

const DEFAULT_INSURANCE_VALIDITY = 730;//Days valid
const DEFAULT_WARRANTY = "573000000000000";//573 Slon for USA, 0.05688 USD in Ethiopia, 100.66*0.05688 USD in USA
const DEFAULT_DIPLOMA_VALIDITY = 730;//Days valid
const DEFAULT_DIPLOMA_PRICE = "475000000000000";//475 Slon for USA, 0.04722 USD in Ethiopia, 100.66*0.04722 USD in USA
// I propose to giveout 10x of badge price, and round to the nearest round integer, so 5k Slon for a US student
const MAX_CACHE_SIZE = 25 * 1024 * 1024; // 25 MB will probably result in 50 MB with IndexedDB storage overhead

// Setting related

export const SettingKey = {
    ACCOUNT: 'account',
    ENCRYPTION_KEY: 'encryptionKey',
    IV: 'iv',
    TUTOR: 'tutor',
    LESSON: 'lesson',
    RESULTS_FOR_LESSON: 'resultsForLesson',
    DEVELOPER: 'developer',
    TEACHER: 'teacher',
    DIPLOMA_PRICE: 'diploma_price',
    DIPLOMA_WARRANTY: 'diploma_warranty',
    DIPLOMA_VALIDITY: 'diploma_validity',
    INSURANCE_VALIDITY: 'insurance_validity',
    CID_CACHE_SIZE: 'cid_cache_size',
    ECONOMY_INITIALIZED: 'ECONOMY_INITIALIZED',
    AIRDROP_COMPATIBLE: 'AIRDROP_COMPATIBLE',
    RECEIVED_AIRDROP: 'RECEIVED_AIRDROP',
    LESSON_RESULTS_ARE_SHOWN: 'LESSON_RESULTS_ARE_SHOWN',
};

export async function storeSetting(id: string, value: string) {
    const cleanId = DOMPurify.sanitize(id);
    const cleanValue = DOMPurify.sanitize(value);
    await db.settings.put({ id: cleanId, value: cleanValue });
}

export async function deleteSetting(id: string) {
    const cleanId = DOMPurify.sanitize(id);
    await db.settings.delete(cleanId);
}

export async function getSetting(id: string): Promise<string | undefined> {
    const cleanId = DOMPurify.sanitize(id);
    const setting = await db.settings.get(cleanId);
    return setting ? setting.value : undefined;
};

export async function hasSetting(id: string): Promise<boolean> {
    const value = await getSetting(id);
    return value ? true : false;
};

export async function getInsuranceDaysValid() {
    const stored_validity = await getSetting(SettingKey.INSURANCE_VALIDITY);
    return stored_validity ? parseInt(stored_validity, 10) : DEFAULT_INSURANCE_VALIDITY;
}

// Signer related

export async function setLastUsedLetterNumber(publicKey: string, lastUsed: number) {
    await db.signers.update(publicKey, { lastLetterNumber: lastUsed });
}

export async function getLastUnusedLetterNumber(publicKey: string) {
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

// Pseudonym related

function isValidPublicKey(publicKey: string) {
    try {
        if (!isHex(publicKey)) {
            return false;
        }
        const decoded = decodeAddress(publicKey);
        const encoded = encodeAddress(decoded);
        return u8aToHex(decoded) === publicKey || encoded === publicKey;
    } catch (error) {
        return false;
    }
}

export async function storePseudonym(publicKey: string, pseudonym: string) {
    if (isValidPublicKey(publicKey)) {
        const cleanPseudonym = DOMPurify.sanitize(pseudonym);
        const samePseudonym = await db.pseudonyms.get({ publicKey: publicKey });
        if (samePseudonym === undefined) {
            const newPseudonym: Pseudonym = { publicKey: publicKey, pseudonym: cleanPseudonym, altPseudonym: "" };
            await db.pseudonyms.put(newPseudonym);
        } else if (samePseudonym.pseudonym !== cleanPseudonym) {
            await db.pseudonyms.update(publicKey, { altPseudonym: cleanPseudonym });
        }
    }
}

export async function getPseudonym(publicKey: string): Promise<string | undefined> {
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

export async function getAllPseudonyms() {
    return await db.pseudonyms.toArray();
}

// CanceledLetter related

export async function putCanceledLetter(canceledLetter: CanceledLetter) {
    await db.canceledLetters.put(canceledLetter);
}

// Letter related

export async function putLetter(letter: Letter) {
    await db.letters.put(letter);
}

export async function deleteLetter(pubSign: string) {
    await db.letters.delete(pubSign);
}

export async function getLetter(pubSign: string) {
    return await db.letters.get(pubSign);
}

export async function getAllLetters() {
    return await db.letters.toArray();
}

export async function getLetters(worker: string, startDate: number | null, endDate: number | null) {
    let query = db.letters.where('workerId').equals(worker);
    if (startDate || endDate) {
        query = query.filter((letter: Letter) => {
            if (startDate && letter.created < startDate) return false;
            if (endDate && letter.created > endDate) return false;
            return true;
        });
    }
    return await query.reverse().sortBy('created');
}

export async function getLettersForKnowledgeId(workerId: string, knowledgeId: string): Promise<Letter[]> {
    return await db.letters
        .where('[workerId+knowledgeId]')
        .equals([workerId, knowledgeId])
        .toArray();
}

export async function getLettersByWorkerId(workerId: string) {
    return await db.letters.where({ workerId: workerId }).toArray();
};

export async function updateLetterReexaminingCount(pubSign: string, time: number) {
    const letter = await db.letters.get(pubSign);
    if (letter) {
        const newExamCount = letter.examCount + 1;
        return await db.letters.update(pubSign, { examCount: newExamCount, lastExamined: time });
    }
    return undefined;
}

export async function cancelLetter(pubSign: string, time: number) {
    const letter: Letter | undefined = await getLetter(pubSign);
    if (letter) {
        const canceledLetter: CanceledLetter = {
            pubSign: letter.pubSign,
            created: letter.created,
            examCount: letter.examCount,
            canceled: time,
            workerId: letter.workerId,
            knowledgeId: letter.knowledgeId,
            cid: letter.cid,
            referee: letter.referee,
        };
        await putCanceledLetter(canceledLetter);
        await deleteLetter(letter.pubSign);
    }
}

export async function cancelLetterByRefereeAndLetterNumber(referee: string, letterId: number, time: number) {
    const letters = await db.letters
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
    letters.forEach(async (letter) => {
        const canceledLetter: CanceledLetter = {
            pubSign: letter.pubSign,
            created: letter.created,
            examCount: letter.examCount,
            canceled: time,
            workerId: letter.workerId,
            knowledgeId: letter.knowledgeId,
            cid: letter.cid,
            referee: letter.referee,
        };

        await Promise.all([
            putCanceledLetter(canceledLetter),
            deleteLetter(letter.pubSign),
        ]);
    });
};

export async function createAndStoreLetter(data: string[]) {
    const [textHash,
        workerId,
        genesisHex,
        letterIdStr,
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
        examCount: 1,
        lastExamined: now,
        workerId: workerId,
        knowledgeId: knowledgeId,
        cid: textHash,
        genesis: genesisHex,
        letterId: parseInt(letterIdStr, 10),
        block: blockNumber,
        referee: refereePublicKeyHex,
        worker: workerPublicKeyHex,
        amount: amount,
        privSign: refereeSignOverPrivateData,
        pubSign: refereeSignOverReceipt
    };
    await putLetter(letter);
}

export function deserializeLetter(data: string, workerId: string, genesis: string, amount: string): Letter {
    const [
        created,
        knowledgeId,
        cid,
        letterId,
        block,
        referee,
        worker,
        privSign,
        pubSign,
    ] = data.split(',');
    const timeStamp = parseInt(created, 10);
    const result: Letter = {
        created: timeStamp,
        examCount: 1,
        lastExamined: timeStamp,
        workerId,
        knowledgeId,
        cid,
        genesis,
        letterId: parseInt(letterId, 10),
        block,
        referee,
        worker,
        amount,
        privSign,
        pubSign
    };
    return result;
}

// Reexamination related

export async function putReexamination(reexamination: Reexamination) {
    await db.reexaminations.put(reexamination);
}

export async function getReexamination(pubSign: string) {
    return await db.reexaminations.get(pubSign);
}

export async function getReexaminationsByLessonId(lessonId: string) {
    return await db.reexaminations.where({ lesson: lessonId }).sortBy('stage');
}

export async function isThereAnyLessonResult(lessonId: string) {
    const lesson = await getLesson(lessonId);
    if (lesson) {
        const letterTemplates: LetterTemplate[] = await getValidLetterTemplatesByLessonId(lesson.id);
        const numberOfValidLetters = letterTemplates.length;
        let calculatedReexaminationsPerformed = 0;
        const reexaminations = await getReexaminationsByLessonId(lesson.id);
        if (reexaminations) {
            let failedReexaminationsCount = 0;
            let skippedReexaminationsCount = 0;
            reexaminations.forEach(reexamination => {
                if (!reexamination.valid) {
                    failedReexaminationsCount++;
                }
                if (reexamination.created === reexamination.lastExamined) {
                    skippedReexaminationsCount++;
                }
            });
            calculatedReexaminationsPerformed = lesson.reexamineStep - skippedReexaminationsCount;
        }
        return (numberOfValidLetters + calculatedReexaminationsPerformed) > 0;
    }
    return false;
}

export async function updateReexamination(reexamination: Reexamination) {
    await db.reexaminations.update(reexamination.pubSign, reexamination);
}

// LetterTemplate related

export async function putLetterTemplate(letterTemplate: LetterTemplate) {
    await db.letterTemplates.put(letterTemplate);
}

export async function getLetterTemplate(lesson: string, stage: number) {
    return await db.letterTemplates.get({ lesson: lesson, stage: stage });
}

export async function getLetterTemplatesByLessonId(lessonId: string) {
    return await db.letterTemplates.where({ lesson: lessonId }).sortBy('stage');
}

export async function getValidLetterTemplatesByLessonId(lessonId: string): Promise<LetterTemplate[]> {
    return await db.letterTemplates.where({ lesson: lessonId }).filter(letter => letter.valid).toArray();
}

export function serializeAsLetter(letterTemplate: LetterTemplate, referee: string): string {
    return [
        letterTemplate.lastExamined,
        letterTemplate.knowledgeId,
        letterTemplate.cid,
        letterTemplate.letterId.toString(),
        letterTemplate.block,
        referee,
        letterTemplate.worker,
        letterTemplate.privSign,
        letterTemplate.pubSign
    ].join(",");
}

// Lesson related

export function getLessonId(studentPublicKeyHex: string, ids: any[]): string {
    const date = new Date().toISOString().split('T')[0]; // Get the current date in YYYY-MM-DD format
    const dataToHash = `${date}-${studentPublicKeyHex}-${ids.join('-')}`;
    const hash = blake2AsHex(dataToHash);
    return hash;
};

export async function getLesson(id: string) {
    return await db.lessons.get(id);
}

export async function getLessons(tutor: string, startDate: number | null, endDate: number | null) {
    let query = db.lessons.where('tutor').equals(tutor);
    if (startDate || endDate) {
        query = query.filter((lesson) => {
            if (startDate && lesson.created < startDate) return false;
            if (endDate && lesson.created > endDate) return false;
            return true;
        });
    }
    return await query.reverse().sortBy('created');
}
export async function updateAllLessons(newDPrice: string, newDWarranty: string, newDValidity: number) {
    try {
        await db.transaction('rw', db.lessons, async () => {
            const lessons = await db.lessons.toArray();

            const updates = lessons.map(lesson => ({
                ...lesson,
                dPrice: newDPrice,
                dWarranty: newDWarranty,
                dValidity: newDValidity
            }));

            await db.lessons.bulkPut(updates);
        });
    } catch (error) {
        console.error('Error updating lessons:', error);
    }
}

export async function deleteLesson(id: string) {
    await db.lessons.delete(id);
}

export async function storeLesson(lessonRequest: LessonRequest, tutor: string) {
    const now = (new Date()).getTime();
    const stored_warranty = await getSetting(SettingKey.DIPLOMA_WARRANTY);
    const stored_validity = await getSetting(SettingKey.DIPLOMA_VALIDITY);
    const stored_diploma_price = await getSetting(SettingKey.DIPLOMA_PRICE);
    const warranty = stored_warranty ? stored_warranty : DEFAULT_WARRANTY;
    const validity: number = stored_validity ? parseInt(stored_validity, 10) : DEFAULT_DIPLOMA_VALIDITY;
    const diploma_price = stored_diploma_price ? stored_diploma_price : DEFAULT_DIPLOMA_PRICE;
    const lesson: Lesson = {
        id: lessonRequest.lesson,
        created: now,
        cid: lessonRequest.cid,
        tutor: tutor,
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
        let studyStage = 0;
        await Promise.all(lessonRequest.learn.map(async (item: string[]) => {
            const letterTemplate: LetterTemplate = {
                stage: studyStage++,
                valid: false,
                lastExamined: now,
                lesson: lesson.id,
                knowledgeId: item[0],
                cid: item[1],
                genesis: '',
                letterId: -1,
                block: '',
                worker: item[2],
                amount: '',
                privSign: '',
                pubSign: '',
            };
            return await putLetterTemplate(letterTemplate);
        }));
        let reexaminationStage = 0;
        await Promise.all(lessonRequest.reexamine.map(async (item: string[]) => {
            const reexamination: Reexamination = {
                created: now,
                stage: reexaminationStage++,
                lastExamined: now,
                valid: true,
                lesson: lesson.id,
                cid: item[0],
                amount: item[1],
                pubSign: item[2],
            };
            return await putReexamination(reexamination);
        }));
    }
    await storeSetting(SettingKey.LESSON, lessonRequest.lesson);
}

export async function updateLesson(lesson: Lesson) {
    const sameLesson = await db.lessons.get({ id: lesson.id });
    if (sameLesson !== undefined) {
        await db.lessons.update(lesson.id, lesson);
    }
}

// Agreement related

export async function getAgreement(id: string) {
    return await db.agreements.get(id);
}

export async function putAgreement(agreement: Agreement) {
    await db.agreements.put(agreement);
}

// CIDCache related

export async function getCIDCache(cid: string) {
    return await db.cidCache.get(cid);
}

async function evictEntries(requiredSize: number) {
    let freedSpace = 0;
    const entries = await db.cidCache
        .orderBy('time')
        .until(() => freedSpace >= requiredSize)
        .toArray();
    const deletePromises = entries.map(async ({ cid, size }) => {
        await db.cidCache.delete(cid);
        freedSpace += size || 0;
    });
    await Promise.all(deletePromises);
    return freedSpace;
};

let cacheLock = Promise.resolve();
async function runLocked(fn: () => Promise<void>) {
    const unlock = cacheLock.then(() => fn());
    cacheLock = unlock.catch(() => { });
    return unlock;
};

export async function putCIDCache(cid: string, data: string) {
    const size = new Blob([data]).size + new Blob([cid]).size;
    await runLocked(async () => {
        const cidCacheSizeString = await getSetting(SettingKey.CID_CACHE_SIZE);
        let totalCacheSize = cidCacheSizeString ? parseInt(cidCacheSizeString, 10) : 0;
        if (totalCacheSize + size > MAX_CACHE_SIZE) {
            const spaceNeeded = totalCacheSize + size - MAX_CACHE_SIZE;
            const freedSpace = await evictEntries(spaceNeeded);
            totalCacheSize -= freedSpace;
        }
        await db.cidCache.put({ cid, data, size, time: Date.now() });
        totalCacheSize += size;
        await storeSetting(SettingKey.CID_CACHE_SIZE, totalCacheSize.toString());
    });
};

// CanceledInsurance related

export async function putCanceledInsurance(canceledInsurance: CanceledInsurance) {
    await db.canceledInsurances.put(canceledInsurance);
}

// Insurance related

export async function putInsurance(insurance: Insurance) {
    await db.insurances.put(insurance);
}

export async function getInsurance(workerSign: string) {
    return await db.insurances.get(workerSign);
}

export async function getAllInsurances() {
    return await db.insurances.toArray();
}

export async function getInsurances(employer: string, worker: string, startDate: number | null, endDate: number | null) {
    let query = db.insurances.where('[employer+workerId]').equals([employer, worker]);
    query = query.filter((insurance: Insurance) => {
        if (startDate && insurance.created < startDate) return false;
        if (endDate && insurance.created > endDate) return false;
        return true;
    });
    return await query.reverse().sortBy('created');
}

export async function getInsurancesByRefereeAndLetterNumber(referee: string, letterId: number) {
    return await db.insurances
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
}

export async function deleteInsurance(workerSign: string) {
    await db.insurances.delete(workerSign);
}

export async function updateInsurance(insurance: Insurance) {
    await db.insurances.update(insurance.workerSign, insurance);
}

export async function cancelInsuranceByRefereeAndLetterNumber(referee: string, letterId: number, time: number) {
    const insurances = await db.insurances
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
    insurances.forEach(async (insurance) => {
        const canceledInsurance: CanceledInsurance = {
            workerSign: insurance.workerSign,
            created: insurance.created,
            canceled: time,
            workerId: insurance.workerId,
            knowledgeId: insurance.knowledgeId,
            cid: insurance.cid,
            referee: insurance.referee,
            employer: insurance.employer,
        };
        await Promise.all([
            await putCanceledInsurance(canceledInsurance),
            await deleteInsurance(insurance.workerSign),
        ]);
    });
};

export async function cancelInsurance(workerSign: string, time: number) {
    const insurance: Insurance | undefined = await getInsurance(workerSign);
    if (insurance) {
        const canceledInsurance: CanceledInsurance = {
            workerSign: insurance.workerSign,
            created: insurance.created,
            canceled: time,
            workerId: insurance.workerId,
            knowledgeId: insurance.knowledgeId,
            cid: insurance.cid,
            referee: insurance.referee,
            employer: insurance.employer,
        };
        await putCanceledInsurance(canceledInsurance);
        await deleteInsurance(insurance.workerSign);
    }
}

export async function storeInsurances(insurancesTransfer: InsurancesTransfer) {
    const now = (new Date()).getTime();
    if (Array.isArray(insurancesTransfer.insurances) && insurancesTransfer.insurances.length > 0) {
        for (let i = insurancesTransfer.insurances.length - 1; i >= 0; i--) {
            const insuranceDataString = insurancesTransfer.insurances[i];
            const insuranceDataArray = insuranceDataString.split(",");
            insuranceDataArray.unshift(insurancesTransfer.identity, insurancesTransfer.employer);
            await createAndStoreInsurance(insuranceDataArray, now);
        }
    } else {
        console.error("Invalid or empty insurances data.");
    }
};

async function createAndStoreInsurance(data: string[], timeStamp: number) {
    const [
        workerId,
        employerPublicKeyHex,
        worker,
        knowledgeId,
        cid,
        genesisHex,
        letterIdStr,
        blockNumber,
        blockAllowed,
        refereePublicKeyHex,
        amountValue,
        refereeSignOverPrivateData,
        refereeSignOverReceipt,
        workerSignOverInsurance] = data;

    const letterId = parseInt(letterIdStr, 10);
    const sameInsurances = await getInsurancesByRefereeAndLetterNumber(refereePublicKeyHex, letterId);
    if (sameInsurances.length === 0) {
        const insurance: Insurance = {
            created: timeStamp,
            valid: true,
            lesson: '',
            workerId: workerId,
            knowledgeId: knowledgeId,
            cid: cid,
            genesis: genesisHex,
            letterId: letterId,
            block: blockNumber,
            blockAllowed: blockAllowed,
            referee: refereePublicKeyHex,
            worker: worker,
            amount: amountValue,
            privSign: refereeSignOverPrivateData,
            pubSign: refereeSignOverReceipt,
            employer: employerPublicKeyHex,
            workerSign: workerSignOverInsurance,
        };
        await putInsurance(insurance);
    }
}

export function serializeInsurance(insurance: Insurance): string {
    return [
        insurance.worker,
        insurance.knowledgeId,
        insurance.cid,
        insurance.genesis,
        insurance.letterId,
        insurance.block,
        insurance.blockAllowed,
        insurance.referee,
        insurance.amount,
        insurance.privSign,
        insurance.pubSign,
        insurance.workerSign,
    ].join(",");
}

export function letterToInsurance(letter: Letter, employer: string, workerSign: string, blockAllowed: string, timeStamp: number): Insurance {
    const insurance: Insurance = {
        created: timeStamp,
        valid: true,
        lesson: '',
        workerId: letter.workerId,
        knowledgeId: letter.knowledgeId,
        cid: letter.cid,
        genesis: letter.genesis,
        letterId: letter.letterId,
        block: letter.block,
        blockAllowed: blockAllowed,
        referee: letter.referee,
        worker: letter.worker,
        amount: letter.amount,
        privSign: letter.privSign,
        pubSign: letter.pubSign,
        employer: employer,
        workerSign: workerSign,
    }
    return insurance;
}

// Reimbursement related

export async function addReimbursement(reimbursement: Reimbursement) {
    await db.reimbursements.add(reimbursement);
}

export async function getAllReimbursements() {
    return await db.reimbursements.toArray();
}

export async function getReimbursementsByReferee(referee: string) {
    return await db.reimbursements.where({ referee: referee }).toArray();
}

export async function getReimbursementsByRefereeAndLetterNumber(referee: string, letterId: number) {
    return await db.reimbursements
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
}

export async function deleteReimbursement(referee: string, letterId: number) {
    await db.reimbursements
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .delete();
}

export function letterToReimbursement(letter: Letter, employer: string, workerSign: string, blockAllowed?: string): Reimbursement {
    const reimbursement: Reimbursement = {
        genesis: letter.genesis,
        letterId: letter.letterId,
        block: letter.block,
        blockAllowed: blockAllowed ? blockAllowed : letter.block,
        referee: letter.referee,
        worker: letter.worker,
        amount: letter.amount,
        pubSign: letter.pubSign,
        employer: employer,
        workerSign: workerSign,
    }
    return reimbursement;
}

export function insuranceToReimbursement(insurance: Insurance): Reimbursement {
    const reimbursement: Reimbursement = {
        genesis: insurance.genesis,
        letterId: insurance.letterId,
        block: insurance.block,
        blockAllowed: insurance.blockAllowed,
        referee: insurance.referee,
        worker: insurance.worker,
        amount: insurance.amount,
        pubSign: insurance.pubSign,
        employer: insurance.employer,
        workerSign: insurance.workerSign,
    }
    return reimbursement;
}

// UsageRight related

export async function putUsageRight(usageRight: UsageRight) {
    await db.usageRights.put(usageRight);
}

export async function markUsageRightAsUsed(referee: string, letterId: number) {
    const usageRights = await db.usageRights
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
    usageRights.forEach(async (usageRight) => {
        await putUsageRight({ ...usageRight, used: true });
    });
};

export async function deleteUsageRight(referee: string, letterId: number) {
    await db.usageRights
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .delete();
}

export function insuranceToUsageRight(insurance: Insurance): UsageRight {
    const usageRight: UsageRight = {
        used: false,
        created: insurance.created,
        pubSign: insurance.pubSign,
        employer: insurance.employer,
        workerSign: insurance.workerSign,
        referee: insurance.referee,
        letterId: insurance.letterId,
    };
    return usageRight;
}

// Export DB

export async function exportDB(progressCallback?: (progress: number) => void): Promise<Blob> {
    try {
        const blob = await dexieExport(db, {
            prettyJson: true,
            progressCallback,
            filter: (tableName: string) => tableName !== 'cidCache',
        });
        return blob;
    } catch (error) {
        console.error('Error exporting Dexie database:', error);
        throw error;
    }
}

export interface DexieTableData {
    tableName: string;
    inbound: boolean;
    rows: any;
}
export interface DexieTableInfo {
    name: string;
    schema: string;
    rowCount: number;
}

export interface DBExportFormat {
    databaseName: string;
    databaseVersion: number;
    tables: DexieTableInfo[];
    data: DexieTableData[]
}
export interface DexieExportFormat {
    formatName: string;
    formatVersion: string[][];
    data: DBExportFormat;
}

export async function replaceDB(json: DexieExportFormat): Promise<void> {
    try {
        const uploadedVersion = json.data.databaseVersion;
        const currentVersion = db.verno;
        if (uploadedVersion > currentVersion) {
            throw new Error('Update your application to match the database version.');
        }
        for (const { tableName, rows } of json.data.data) {
            if (db.tables.some((table) => table.name === tableName)) {
                const table = db.table(tableName);
                await table.clear();
                await table.bulkAdd(rows);
            } else {
                console.warn(`Unknown table in backup JSON: ${tableName}`);
            }
        }
    } catch (error) {
        console.error('Error syncing database:', error);
        throw new Error('Failed to synchronize database');
    }
}

export type Badge = Letter | Insurance;
export type Recommendation = Letter | Insurance | Reimbursement;
export function isInsurance(badge: Badge): badge is Insurance {
    return (badge as Insurance).employer !== undefined;
}