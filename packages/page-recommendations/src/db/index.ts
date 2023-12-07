import Dexie, { Table } from "dexie";
import { Letter } from "./Letter.js";
import { Pseudonym } from "./Pseudonym.js";
import { Signer } from "./Signer.js";
import { UsageRight } from "./UsageRight.js";
import { Insurance } from "./Insurance.js";
import { Setting } from "./Setting.js";

class SlonigirafDB extends Dexie {
  letters!: Table<Letter>;
  pseudonyms!: Table<Pseudonym>;
  signers!: Table<Signer>;
  usageRights!: Table<UsageRight>;
  insurances!: Table<Insurance>;
  settings!: Table<Setting>;

  constructor() {
    super("slonigiraf");
    this.version(18).stores({
      letters: "++id,created,workerId,cid,genesis,letterNumber,block,referee,worker,amount,signOverPrivateData,signOverReceipt",
      pseudonyms: "&publicKey,pseudonym,altPseudonym",
      signers: "++id,publicKey",
      usageRights: "++id,created,signOverReceipt,employer,sign",
      insurances: "++id,created,workerId,cid,genesis,letterNumber,block,referee,worker,amount,signOverPrivateData,signOverReceipt,employer,workerSign,wasUsed,[employer+workerId]",
      settings: "&id",
    });
  }
}

export const db = new SlonigirafDB();