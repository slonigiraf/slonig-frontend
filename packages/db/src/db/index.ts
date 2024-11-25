import Dexie, { Table } from 'dexie';
import { LetterTemplate } from './LetterTemplate.js';
import { Letter } from './Letter.js';
import { CanceledLetter } from './CanceledLetter.js';
import { CanceledInsurance } from './CanceledInsurance.js';
import { Pseudonym } from './Pseudonym.js';
import { Signer } from './Signer.js';
import { UsageRight } from './UsageRight.js';
import { Insurance } from './Insurance.js';
import { Reimbursement } from './Reimbursement.js';
import { Setting } from './Setting.js';
import { Lesson } from './Lesson.js';
import { Agreement } from './Agreement.js';
import { CIDCache } from './CIDCache.js';
import { Reexamination } from './Reexamination.js';

class SlonigirafDB extends Dexie {
  letters!: Table<Letter>;
  letterTemplates!: Table<LetterTemplate>;
  canceledLetters!: Table<CanceledLetter>;
  canceledInsurances!: Table<CanceledInsurance>;
  pseudonyms!: Table<Pseudonym>;
  signers!: Table<Signer>;
  usageRights!: Table<UsageRight>;
  insurances!: Table<Insurance>;
  reexaminations!: Table<Reexamination>; 
  reimbursements!: Table<Reimbursement>;
  settings!: Table<Setting>;
  lessons!: Table<Lesson>;
  agreements!: Table<Agreement>;
  cidCache!: Table<CIDCache>;

  constructor() {
    super('slonig');
    this.version(52).stores({
      settings: '&id',
      signers: '&publicKey',
      pseudonyms: '&publicKey',
      canceledLetters: '&signOverReceipt',
      letters: '&signOverReceipt,created,lastExamined,workerId,knowledgeId,cid,referee,[workerId+knowledgeId],[referee+letterNumber]',
      reexaminations: '&signOverReceipt,lesson',
      lessons: '&id,created,tutor',

      
      
      
      letterTemplates: '&[cid+lesson],lesson',
      
      canceledInsurances: '&workerSign',
      usageRights: '&[signOverReceipt+employer],[referee+letterNumber]',
      insurances: '&workerSign,created,workerId,[employer+workerId],[referee+letterNumber]',
      
      reimbursements: '&workerSign,[referee+letterNumber],referee',
      
      
      agreements: '&id',
      cidCache: '&cid,time',
    });
  }
}

export const db = new SlonigirafDB();