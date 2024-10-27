import Dexie, { Table } from "dexie";
import { Letter } from "./Letter.js";
import { Pseudonym } from "./Pseudonym.js";
import { Signer } from "./Signer.js";
import { UsageRight } from "./UsageRight.js";
import { Insurance } from "./Insurance.js";
import { Setting } from "./Setting.js";
import { Lesson } from "./Lesson.js";

class SlonigirafDB extends Dexie {
  letters!: Table<Letter>;
  pseudonyms!: Table<Pseudonym>;
  signers!: Table<Signer>;
  usageRights!: Table<UsageRight>;
  insurances!: Table<Insurance>;
  settings!: Table<Setting>;
  lessons!: Table<Lesson>;

  constructor() {
    super("slonigiraf");
    this.version(33).stores({
      letters: "++id,created,lastReexamined,lesson,workerId,knowledgeId,cid,referee,signOverReceipt,[lesson+signOverReceipt],[workerId+knowledgeId],[workerId+lesson]",
      pseudonyms: "&publicKey",
      signers: "++id,publicKey",
      usageRights: "++id,sign",
      insurances: "++id,created,lesson,referee,workerId,[employer+workerId],[lesson+signOverReceipt]",
      settings: "&id",
      lessons: "&id,created,tutor",
    });
  }
}

export const db = new SlonigirafDB();