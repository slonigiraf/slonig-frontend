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
import type { Lesson, TutorAction } from "./db/Lesson.js";
import DOMPurify from 'dompurify';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { isHex, u8aToHex } from '@polkadot/util';
import { blake2AsHex } from '@polkadot/util-crypto';
import "dexie-export-import";
import { exportDB as dexieExport } from 'dexie-export-import';
import { InsurancesTransfer, LessonRequest } from "@slonigiraf/slonig-components";
import { CanceledInsurance } from "./db/CanceledInsurance.js";
import { Repetition } from "./db/Repetition.js";
import { EXAMPLE_MODULE_KNOWLEDGE_CID, EXAMPLE_SKILL_KNOWLEDGE_ID } from "@slonigiraf/utils";
import { LearnRequest } from "./db/LearnRequest.js";
import { ScheduledEvent, ScheduledEventType } from "./db/ScheduledEvent.js";
import Dexie from "dexie";

export type { LearnRequest, TutorAction, CanceledInsurance, Reexamination, LetterTemplate, CanceledLetter, Reimbursement, Letter, Insurance, Lesson, Pseudonym, Setting, Signer, UsageRight, Agreement };

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
    TUTEE_TUTORIAL_COMPLETED: 'TUTEE_TUTORIAL_COMPLETED',
    TUTOR_TUTORIAL_COMPLETED: 'TUTOR_TUTORIAL_COMPLETED',
    ASSESSMENT_TUTORIAL_COMPLETED: 'ASSESSMENT_TUTORIAL_COMPLETED',
    SCAN_TUTORIAL_COMPLETED: 'SCAN_TUTORIAL_COMPLETED',
    PRESSING_EXAMPLES_TUTORIAL_COMPLETED: 'PRESSING_EXAMPLES_TUTORIAL_COMPLETED',
    EXPECTED_AIRDROP: 'EXPECTED_AIRDROP',
    OPENAI_TOKEN: 'OPENAI_TOKEN',
    NOW_IS_CLASS_ONBOARDING: 'NOW_IS_CLASS_ONBOARDING',
    LAST_BACKUP_TIME: 'LAST_BACKUP_TIME',
    LAST_PARTNER_CHANGE_TIME: 'LAST_PARTNER_CHANGE_TIME',
    PARTNERS_WITHIN_CLASSROOM: 'PARTNERS_WITHIN_CLASSROOM',
    LAST_SKILL_TUTORING_START_TIME: 'LAST_SKILL_TUTORING_START_TIME',
    LAST_SKILL_TUTORING_ID: 'LAST_SKILL_TUTORING_ID',
    LAST_LESSON_START_TIME: 'LAST_LESSON_START_TIME',
    LAST_LESSON_ID: 'LAST_LESSON_ID',
    FALLBACK_KNOWLEDGE_ID: 'FALLBACK_KNOWLEDGE_ID',
    APP_VERSION: 'APP_VERSION',
    REQUIRE_SUPERVISION: 'REQUIRE_SUPERVISION',
    COUNT_WITHOUT_CORRECT_FAKE_IN_RAW: 'COUNT_WITHOUT_CORRECT_FAKE_IN_RAW',
    LAST_BAN_START_TIME: 'LAST_BAN_START_TIME',
    BAN_COUNT: 'BAN_COUNT',
    REDO_TUTORIAL: 'REDO_TUTORIAL',
} as const;

export async function storeSetting(id: string, value: string) {
    const cleanId = DOMPurify.sanitize(id);
    const cleanValue = DOMPurify.sanitize(value);
    await db.settings.put({ id: cleanId, value: cleanValue });
}

export async function setSettingToTrue(id: string) {
    const cleanId = DOMPurify.sanitize(id);
    await db.settings.put({ id: cleanId, value: 'true' });
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

// LearnRequests related

export async function putLearnRequest(learnRequest: LearnRequest) {
    await db.learnRequests.put(learnRequest);
}

export async function deleteLearnRequest(id: string) {
    await db.learnRequests.delete(id);
}

export async function getLastNonFinishedLessonRequest(createdBefore: number) {
    return db.learnRequests
        .where('created')
        .below(createdBefore)
        .reverse()
        .first();
}
// ScheduledEvent related

export async function putScheduledEvent(scheduledEvent: ScheduledEvent) {
    return db.scheduledEvents.put(scheduledEvent);
}

export async function deleteScheduledEvent(id: number) {
    return db.scheduledEvents.delete(id);
}

export async function deleteAllBanScheduledEvents() {
  return db.scheduledEvents
    .where('type')
    .equals('BAN')
    .delete();
}

export async function getFirstScheduledEventByType(type: ScheduledEventType) {
  return db.scheduledEvents
    .where('[type+id]')
    .between([type, Dexie.minKey], [type, Dexie.maxKey])
    .first();
}

export async function getAllLogEvents() {
  return db.scheduledEvents.where('type').equals('LOG').toArray();
}

export async function getAllBanEvents() {
  return db.scheduledEvents.where('type').equals('BAN').toArray();
}

// SkillTemplate related

export async function storeSkillTemplate(moduleId: string, content: string): Promise<string> {
    const id = blake2AsHex(content);
    const record = {
        id,
        moduleId,
        content: content
    };
    await db.skillTemplates.put(record);
    return id;
}

export async function getSkillTemplates(moduleId: string) {
    return await db.skillTemplates.where('moduleId').equals(moduleId).toArray();
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
            await db.pseudonyms.update(publicKey, { pseudonym: cleanPseudonym, altPseudonym: samePseudonym.pseudonym });
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

// Repetitions related

export async function putRepetition(repetition: Repetition) {
    await db.repetitions.put(repetition);
}

export async function deleteRepetition(workerId: string, knowledgeId: string) {
    await db.repetitions.delete([workerId, knowledgeId]);
}

export async function getRepetitionsForKnowledgeId(workerId: string, knowledgeId: string): Promise<Repetition[]> {
    return await db.repetitions
        .where('[workerId+knowledgeId]')
        .equals([workerId, knowledgeId])
        .toArray();
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

// get 4 letters from 2 different referees
export async function getLettersToReexamine(): Promise<Letter[]> {
    const results: Letter[] = [];
    const refereeCounts = new Map<string | null | undefined, number>();

    const canTake = (l: Letter): boolean => {
        const key = l.referee;
        const used = refereeCounts.get(key) ?? 0;
        return used < 2;
    };

    const take = (l: Letter): void => {
        results.push(l);
        const key = l.referee;
        refereeCounts.set(key, (refereeCounts.get(key) ?? 0) + 1);
    };

    const findNext = async (
        predicate: (letter: Letter) => boolean
    ): Promise<Letter | undefined> => {
        for (let examCount = 1; examCount <= 3; examCount++) {
            const letter = await db.letters
                .orderBy('created')
                .filter(
                    (l) =>
                        l.examCount === examCount &&
                        l.knowledgeId !== EXAMPLE_SKILL_KNOWLEDGE_ID &&
                        !results.some((r) => r.cid === l.cid) && // prevent duplicates
                        predicate(l) &&
                        canTake(l)
                )
                .first();

            if (letter) return letter;
        }
        return undefined;
    };

    while (results.length < 4) {
        const next = await findNext(() => true);
        if (!next) break;
        take(next);
    }

    return results;
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
export function putReexamination(reexamination: Reexamination) {
    return db.reexams.put(reexamination);
}

export function getReexaminationsByLessonId(lessonId: string) {
    return db.reexams.where({ lesson: lessonId }).sortBy('stage');
}

export async function isThereAnyLessonResult(lessonId: string) {
    const lesson = await getLesson(lessonId);
    if (lesson) {
        const letterTemplates: LetterTemplate[] = await getValidLetterTemplatesByLessonId(lesson.id);
        const repetitions = await getToRepeatLetterTemplatesByLessonId(lesson.id);
        const reexaminations = await getReexaminationsByLessonId(lesson.id);
        const performedReexaminations = reexaminations.filter((r) => r.created !== r.lastExamined);
        return (letterTemplates.length > 0 || performedReexaminations.length > 0 || repetitions.length > 0);
    }
    return false;
}

export function updateReexamination(reexamination: Reexamination) {
    return db.reexams.update([reexamination.pubSign, reexamination.lesson], reexamination);
}

// LetterTemplate related

export function markLetterTemplatePenalized(letterId: number, timeStamp: number) {
    return db.letterTemplates
        .where('letterId')
        .equals(letterId)
        .modify({
            penalizedTime: timeStamp,
        });
}

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
    return await db.letterTemplates.where({ lesson: lessonId }).filter(letter => (letter.valid && letter.mature)).toArray();
}

export async function getIssuedNonPenalizedLetterTemplateIds(): Promise<number[]> {
    const templates = await db.letterTemplates
        .filter(l => l.pubSign.length > 0 && l.penalizedTime === undefined)
        .toArray();

    return templates.map(l => l.letterId);
}

export async function getPenalties(startDate?: number, endDate?: number) {
    let q = db.letterTemplates.where('penalizedTime').above(0); // only rows with a numeric timestamp

    if (startDate !== undefined && endDate !== undefined) {
        q = db.letterTemplates
            .where('penalizedTime')
            .between(startDate, endDate, true, true);
    } else if (startDate !== undefined) {
        q = db.letterTemplates.where('penalizedTime').aboveOrEqual(startDate);
    } else if (endDate !== undefined) {
        q = db.letterTemplates.where('penalizedTime').belowOrEqual(endDate);
    }

    // newest first
    const penalties = await q.reverse().toArray();

    const lessons = await db.lessons.bulkGet(penalties.map(p => p.lesson));
    const lessonMap = new Map(penalties.map((p, i) => [p.lesson, lessons[i]]));

    return penalties.map(p => ({ ...p, student: lessonMap.get(p.lesson)?.student }));
}


export async function getToRepeatLetterTemplatesByLessonId(lessonId: string): Promise<LetterTemplate[]> {
    return await db.letterTemplates.where({ lesson: lessonId }).filter(letter => letter.toRepeat).toArray();
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

export async function deleteLesson(id: string) {
    const letterTemplates = await getLetterTemplatesByLessonId(id);
    await Promise.all(
        letterTemplates.map(t => db.letterTemplates.delete([t.cid, t.lesson]))
    );
    const reexaminations = await getReexaminationsByLessonId(id);
    await Promise.all(
        reexaminations.map(r => db.reexams.delete([r.pubSign, r.lesson]))
    );
    await db.lessons.delete(id);
}

export async function getLastNonSentLesson(starting: number) {
    return db.lessons
        .where('deadline')
        .below(starting)
        .reverse()
        .first();
}

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

export async function storeLesson(lessonRequest: LessonRequest, tutor: string, onResult: () => Promise<void>) {
    let toReexamine: string[][] = lessonRequest.reexamine;

    if (lessonRequest.learn.length > 0 && lessonRequest.reexamine.length >= 1) {
        const nonMatching = lessonRequest.reexamine.filter((x) => x?.[3] !== tutor);
        const matching = lessonRequest.reexamine.filter((x) => x?.[3] === tutor);

        toReexamine = [...nonMatching, ...matching].slice(0, Math.min(2, lessonRequest.reexamine.length));
    }

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
        toReexamineCount: toReexamine.length,
        reexamineStep: 0,
        dPrice: diploma_price,
        dWarranty: warranty,
        dValidity: validity,
        isPaid: false,
        lastAction: undefined,
    };
    const sameLesson = await db.lessons.get({ id: lesson.id });
    if(sameLesson && sameLesson.cid === EXAMPLE_MODULE_KNOWLEDGE_CID){
        await deleteLesson(lesson.id);
    }
    if (sameLesson === undefined || sameLesson.cid === EXAMPLE_MODULE_KNOWLEDGE_CID) {
        await db.lessons.add(lesson);
        let studyStage = 0;
        await Promise.all(lessonRequest.learn.map(async (item: string[]) => {
            const letterTemplate: LetterTemplate = {
                stage: studyStage++,
                valid: false,
                mature: item[3] === '1',
                toRepeat: false,
                penalizedTime: undefined,
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
        await Promise.all(toReexamine.map(async (item: string[]) => {
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
    await onResult();
}

export async function putLesson(lesson: Lesson): Promise<string> {
    return await db.lessons.put(lesson);
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

export type Badge = Letter | Insurance | LetterTemplate;
export type Recommendation = Letter | Insurance | Reimbursement;
export function isInsurance(badge: Badge): badge is Insurance {
    return (badge as Insurance).employer !== undefined;
}