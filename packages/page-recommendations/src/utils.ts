import { getSetting, SettingKey, storeSetting } from "@slonigiraf/db";
import { timeStampStringToNumber } from "@slonigiraf/slonig-components";
import { ONE_SUBJECT_PERIOD_MS } from "@slonigiraf/utils";

export async function processNewPartner(identity: string) {
    let changedThePair = false;
    const lastPair = await getSetting(SettingKey.LAST_PAIR);
    if (lastPair !== identity) {
        await storeSetting(SettingKey.LAST_PAIR, identity);
    }

    if (lastPair && lastPair !== identity) {
        changedThePair = true;
    }

    const lastTimePairChange = timeStampStringToNumber(await getSetting(SettingKey.LAST_PAIR_CHANGE_TIME));
    const now = (new Date()).getTime();
    const shouldUpdateTime = !lastTimePairChange ? true :
        lastPair !== identity ? true :
            (now - lastTimePairChange) > ONE_SUBJECT_PERIOD_MS ? true : false;

    if (shouldUpdateTime) {
        await storeSetting(SettingKey.LAST_PAIR_CHANGE_TIME, now.toString());
    }
    return changedThePair;
}