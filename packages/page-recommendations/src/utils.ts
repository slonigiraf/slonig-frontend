import { getSetting, SettingKey, storeSetting } from "@slonigiraf/db";
import { timeStampStringToNumber } from "@slonigiraf/slonig-components";
import { ONE_SUBJECT_PERIOD_MS } from "@slonigiraf/utils";

export async function processNewPartner(identity: string) {
    const lastPair = await getSetting(SettingKey.LAST_PAIR);
    if (lastPair !== identity) {
        await storeSetting(SettingKey.LAST_PAIR, identity);
    }

    const lastTimePairChange = timeStampStringToNumber(await getSetting(SettingKey.LAST_PAIR_CHANGE_TIME));
    const now = (new Date()).getTime();
    const shouldUpdateTime = !lastTimePairChange ? true :
        (now - lastTimePairChange) > ONE_SUBJECT_PERIOD_MS ? true : false;

    if (shouldUpdateTime) {
        await storeSetting(SettingKey.LAST_PAIR_CHANGE_TIME, now.toString());
    }
}