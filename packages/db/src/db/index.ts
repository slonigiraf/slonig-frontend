import Dexie, { Table } from "dexie";
import { Letter } from "./Letter.js";
import { Pseudonym } from "./Pseudonym.js";
import { Signer } from "./Signer.js";
import { UsageRight } from "./UsageRight.js";
import { Insurance } from "./Insurance.js";
import { Setting } from "./Setting.js";
import { Lesson } from "./Lesson.js";
import { Agreement } from "./Agreement.js";

class SlonigirafDB extends Dexie {
  letters!: Table<Letter>;
  pseudonyms!: Table<Pseudonym>;
  signers!: Table<Signer>;
  usageRights!: Table<UsageRight>;
  insurances!: Table<Insurance>;
  settings!: Table<Setting>;
  lessons!: Table<Lesson>;
  agreements!: Table<Agreement>;

  constructor() {
    super("slonigiraf");
    this.version(36).stores({
      letters: "++id,created,lastReexamined,lesson,workerId,knowledgeId,cid,referee,signOverReceipt,[lesson+signOverReceipt],[workerId+knowledgeId],[workerId+lesson]",
      pseudonyms: "&publicKey",
      signers: "&publicKey",
      usageRights: "++id,sign",
      insurances: "++id,created,lesson,referee,workerId,[employer+workerId],[lesson+signOverReceipt]",
      settings: "&id",
      lessons: "&id,created,tutor",
      agreements: "&id",
    });
  }
}

export const db = new SlonigirafDB();