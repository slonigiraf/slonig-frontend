import { getSetting, SettingKey, storeSetting, TutorAction } from "@slonigiraf/db";
import { PartnersTodayResult, timeStampStringToNumber } from "@slonigiraf/slonig-components";
import { ONE_SUBJECT_PERIOD_MS } from "@slonigiraf/utils";
import type { IconName } from '@fortawesome/fontawesome-svg-core';

/**
 * Stores today's partners as a JSON array (history, can contain duplicates).
 * Also keeps uniqueness info for return values.
 *
 * Behavior:
 * - Always appends `identity` to PARTNERS_WITHIN_CLASSROOM (history).
 * - Resets the array if subject period window elapsed.
 * - LAST_PARTNER_CHANGE_TIME is updated when we start a new window OR when partner differs from last.
 */
export async function processNewPartner(identity: string): Promise<PartnersTodayResult> {
  const now = Date.now();

  const lastTimePairChangeRaw = await getSetting(SettingKey.LAST_PARTNER_CHANGE_TIME);
  const lastTimePairChange = timeStampStringToNumber(lastTimePairChangeRaw);

  const isNewWindow =
    !lastTimePairChange || now - lastTimePairChange > ONE_SUBJECT_PERIOD_MS;

  // Load history array unless window expired (then start fresh)
  let history: string[] = [];
  if (!isNewWindow) {
    const raw = await getSetting(SettingKey.PARTNERS_WITHIN_CLASSROOM);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          history = parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
        }
      } catch {
        // invalid JSON -> treat as empty
      }
    }
  }

  const last = history.length ? history[history.length - 1] : null;
  const isDifferentFromLast = last !== identity;

  // Always push (history, can include duplicates)
  history.push(identity);
  await storeSetting(SettingKey.PARTNERS_WITHIN_CLASSROOM, JSON.stringify(history));

  // Unique counts / "new today" computed from uniques
  const uniques = new Set(history);
  const uniquePartnersToday = uniques.size;

  // If it was new window, it is necessarily new "today" (since we reset).
  // Otherwise, it's new if identity appears exactly once in uniques and wasn't present before push.
  // Easiest: check presence before push using the pre-push set.
  // We'll compute that accurately:
  // (reconstruct prePushUniques only when not new window)
  let isNewPartnerToday: boolean;
  if (isNewWindow) {
    isNewPartnerToday = true;
  } else {
    // pre-push presence is: uniques has identity AND occurrences? Since we already pushed,
    // check if identity existed in the previous history:
    // previous history is current history minus last element.
    const prevHas = history.slice(0, -1).includes(identity);
    isNewPartnerToday = !prevHas;
  }

  // Update time marker:
  // - new window (start of a fresh "today")
  // - or partner changed vs last (what you previously treated as "pair change")
  if (isNewWindow || isDifferentFromLast) {
    await storeSetting(SettingKey.LAST_PARTNER_CHANGE_TIME, now.toString());
  }

  return {
    isNewPartnerToday,
    uniquePartnersToday,
    isDifferentFromLast
  };
}

export interface ActionInfo {
  icon: IconName | undefined;
  comment: string;
}

export const actionToInfo = new Map<TutorAction, ActionInfo>([
  ['skip', { icon: undefined, comment: '' }],

  ['validate', { icon: 'shield', comment: 'You’ve validated a badge issued by another tutor.' }],
  ['revoke', { icon: 'shield-halved', comment: 'You’ve canceled the badge because the student forgot the skill.' }],

  ['mark_mastered_warm_up', { icon: undefined, comment: '' }],
  ['mark_for_repeat_warm_up', { icon: undefined, comment: '' }],

  ['mark_mastered_crude', { icon: 'rotate', comment: 'It looked perfect, but this was the student’s first time learning the skill, so it was marked for repetition.' }],
  ['mark_for_repeat_crude', { icon: 'rotate', comment: 'You’ve taught the skill and marked it for repetition to ensure the student remembers it.' }],

  ['mark_mastered_mature', { icon: 'trophy', comment: 'You’ve prepared a badge to your student.' }],
  ['mark_for_repeat_mature', { icon: 'rotate', comment: 'You were unsure the student would remember the skill, so it was marked for repetition.' }],
]);

export function getActionInfo(action: TutorAction): ActionInfo {
  return (action ? actionToInfo.get(action) : undefined) ?? { icon: undefined, comment: '' };
}