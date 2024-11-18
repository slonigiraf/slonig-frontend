import Dexie, { Table } from 'dexie';
import { Letter } from './Letter.js';
import { Pseudonym } from './Pseudonym.js';
import { Signer } from './Signer.js';
import { UsageRight } from './UsageRight.js';
import { Insurance } from './Insurance.js';
import { Reimbursement } from './Reimbursement.js';
import { Setting } from './Setting.js';
import { Lesson } from './Lesson.js';
import { Agreement } from './Agreement.js';
import { CIDCache } from './CIDCache.js';

class SlonigirafDB extends Dexie {
  letters!: Table<Letter>;
  pseudonyms!: Table<Pseudonym>;
  signers!: Table<Signer>;
  usageRights!: Table<UsageRight>;
  insurances!: Table<Insurance>;
  reimbursements!: Table<Reimbursement>;
  settings!: Table<Setting>;
  lessons!: Table<Lesson>;
  agreements!: Table<Agreement>;
  cidCache!: Table<CIDCache>;

  constructor() {
    super('slonigiraf');
    this.version(40).stores({
      letters: '++id,created,lastExamined,lesson,workerId,knowledgeId,cid,referee,signOverReceipt,[lesson+signOverReceipt],[workerId+knowledgeId],[workerId+lesson]',
      pseudonyms: '&publicKey',
      signers: '&publicKey',
      usageRights: '++id,sign',
      insurances: '++id,created,lesson,referee,workerId,[employer+workerId],[lesson+signOverReceipt]',
      reimbursements: '&[referee+letterNumber],referee,letterNumber',
      settings: '&id',
      lessons: '&id,created,tutor',
      agreements: '&id',
      cidCache: '&cid',
    });
  }
}

export const db = new SlonigirafDB();