import Dexie, { Table } from 'dexie';
import { Agreement } from './Agreement.js';
import { CanceledInsurance } from './CanceledInsurance.js';
import { CanceledLetter } from './CanceledLetter.js';
import { CIDCache } from './CIDCache.js';
import { Insurance } from './Insurance.js';
import { Lesson } from './Lesson.js';
import { Letter } from './Letter.js';
import { LetterTemplate } from './LetterTemplate.js';
import { Pseudonym } from './Pseudonym.js';
import { Reexamination } from './Reexamination.js';
import { Reimbursement } from './Reimbursement.js';
import { Setting } from './Setting.js';
import { Signer } from './Signer.js';
import { UsageRight } from './UsageRight.js';
import { SkillTemplate } from './SkillTemplate.js';
import { Repetition } from './Repetition.js';

class SlonigDB extends Dexie {
  agreements!: Table<Agreement>;
  canceledInsurances!: Table<CanceledInsurance>;
  canceledLetters!: Table<CanceledLetter>;
  cidCache!: Table<CIDCache>;
  insurances!: Table<Insurance>;
  lessons!: Table<Lesson>;
  letters!: Table<Letter>;
  letterTemplates!: Table<LetterTemplate>;
  pseudonyms!: Table<Pseudonym>;
  reexaminations!: Table<Reexamination>;
  reimbursements!: Table<Reimbursement>;
  settings!: Table<Setting>;
  signers!: Table<Signer>;
  usageRights!: Table<UsageRight>;
  skillTemplates!: Table<SkillTemplate>;
  repetitions!: Table<Repetition>;

  constructor() {
    super('slonig');
    this.version(55).stores({
      agreements: '&id',
      canceledInsurances: '&workerSign',
      canceledLetters: '&pubSign',
      cidCache: '&cid,time',
      insurances: '&workerSign,created,workerId,[employer+workerId],[referee+letterId]',
      lessons: '&id,created,tutor',
      letters: '&pubSign,created,workerId,knowledgeId,[workerId+knowledgeId],[referee+letterId]',
      letterTemplates: '&[cid+lesson],lesson',
      pseudonyms: '&publicKey',
      reexaminations: '&pubSign,lesson',
      reimbursements: '&workerSign,referee,[referee+letterId]',
      settings: '&id',
      signers: '&publicKey',
      usageRights: '&[pubSign+employer],[referee+letterId]',
      skillTemplates: '&id,moduleId',
      repetitions: '&[workerId+knowledgeId],lastExamined',
    });
  }
}

export const db = new SlonigDB();