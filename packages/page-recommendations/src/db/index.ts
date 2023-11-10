import Dexie, { Table } from "dexie";
import { Letter } from "./Letter";
import { Pseudonym } from "./Pseudonym";
import { Signer } from "./Signer";
import { UsageRight } from "./UsageRight";
import { Insurance } from "./Insurance";

class SlonigirafDB extends Dexie {
  letters!: Table<Letter>;
  pseudonyms!: Table<Pseudonym>;
  signers!: Table<Signer>;
  usageRights!: Table<UsageRight>;
  insurances!: Table<Insurance>;

  constructor() {
    super("slonigiraf");
    this.version(12).stores({
      letters: "++id,created,cid,genesis,letterNumber,block,referee,worker,amount,signOverPrivateData,signOverReceipt",
      pseudonyms: "++id,publicKey,pseudonym",
      signers: "++id,publicKey",
      usageRights: "++id,created,signOverReceipt,employer,sign",
      insurances: "++id,created,cid,genesis,letterNumber,block,referee,worker,amount,signOverPrivateData,signOverReceipt,employer,workerSign,wasUsed,[employer+worker]",
    });
  }
}

export const db = new SlonigirafDB();