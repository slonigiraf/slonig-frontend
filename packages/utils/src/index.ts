export const EXAMPLE_SKILL_KNOWLEDGE_ID = '0x6d3cd8005f0b14f197f5c3617933afbfd32ca75420773165d3b70e132d5b1df7';
export const EXAMPLE_SKILL_KNOWLEDGE_CID = 'bafyreictjpbqaxvetm6tpimql6bdu6lo4fvhlqljhbggrox5js35fjjapy';
export const EXAMPLE_COURSE_KNOWLEDGE_ID = '0xc758eb9ebae4f7affdf2c7a97d0f7af714efed6e75c0d07131629a6262b45744';
export const EXAMPLE_MODULE_KNOWLEDGE_ID = '0xc93cafd0d50625e1e203d20c596e87b9f01c93798ea8c358370d286903c260b3';
export const EXAMPLE_MODULE_KNOWLEDGE_CID = 'bafyreidptwdha5jb7bzrk2g6vr2bfw6lvxfeff57hxud2u5sansdmowgp4';
export const DEFAULT_KNOWLEDGE_ID = '0xfed8e6f01c6c746876d69f7f10f933cdcd849068f6dc2fa26769fc92584492e7';

export const LEARN_FIRST_TIME_SEC = 206;
export const LEARN_SECOND_TIME_SEC = 94;
export const LESSON_LENGTH_SEC = 30 * 60;

export const MIN_USING_HINT_MS = 2_000;
export const MIN_SKILL_DISCUSSION_MS = 10_000;
export const FAST_SKILL_DISCUSSION_MS = 20_000;
export const MAX_FAST_DISCUSSED_SKILLS_IN_ROW_COUNT = 1;

export const BACKUP_REQUIREMENT_PERIOD_MS = 24 * 60 * 60_000; // One day
export const ONE_SUBJECT_PERIOD_MS = 60 * 60_000; // One hour long lesson
export const MAX_SAME_PARTNER_TIME_MS = 15 * 60_000; // 4 times change per 1 hour
export const TOO_LONG_LESSON_MS = 1.5 * MAX_SAME_PARTNER_TIME_MS;

export const MIN_SAME_PARTNER_TIME_MS = Math.floor(MAX_SAME_PARTNER_TIME_MS / 2);

export const CHECK_WHICH_LETTERS_ISSUED_BY_ME_WERE_PENALIZED_EVERY_MS = 1_000;
export const CHECK_WHICH_MY_LETTERS_WERE_CANCELED_EVERY_MS = 10 * 60_000; // Every 10 min
export const MATOMO_PAUSE_BETWEEN_EVENTS_MS = 250;