interface TranscriptionSkillQuestion {
  question: string;
  answer: string;
}

interface TranscriptionSkill {
  title: string;
  description?: string;
  questions: TranscriptionSkillQuestion[];
}

const MAX_TRANSCRIPTION_KEYWORDS = 80;
const MAX_KEYWORD_LENGTH = 80;
const MAX_PHRASE_WORDS = 4;

const IGNORED_LATEX_WORDS = new Set([
  'begin',
  'cdot',
  'dfrac',
  'displaystyle',
  'end',
  'frac',
  'left',
  'mathrm',
  'operatorname',
  'right',
  'sqrt',
  'text',
  'textbf',
  'textit',
  'times',
]);

function cleanSkillText(value: string | undefined): string {
  return (value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/```[A-Za-z0-9_+-]*|```|`/g, ' ')
    .replace(/\\([A-Za-z]+)/g, ' $1 ')
    .replace(/[{}[\]()]/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordTokenCandidates(value: string): string[] {
  return value.match(/[\p{L}\p{N}][\p{L}\p{N}._+\-/%°µμΩ×^]*/gu) || [];
}

function isNotationLike(value: string): boolean {
  return /\p{N}/u.test(value)
    || /[._+\-/%°µμΩ×^]/u.test(value)
    || (/\p{Lu}/u.test(value) && /\p{Ll}/u.test(value))
    || /^\p{Lu}{2,}$/u.test(value);
}

function isUsefulKeyword(value: string): boolean {
  if (!value || value.length > MAX_KEYWORD_LENGTH) return false;
  if (IGNORED_LATEX_WORDS.has(value.toLowerCase())) return false;

  return isNotationLike(value) || Array.from(value).length >= 4;
}

function shortPhrase(value: string): string | undefined {
  const cleaned = cleanSkillText(value);
  if (!cleaned || cleaned.length > MAX_KEYWORD_LENGTH) return undefined;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > MAX_PHRASE_WORDS) return undefined;
  if (!words.some(isUsefulKeyword)) return undefined;

  return cleaned;
}

/**
 * Build literal vocabulary hints from the active skill without passing full
 * expected-answer sentences to speech recognition. Short titles/answers are
 * kept as phrases, while longer skill content contributes individual terms.
 */
export function skillTranscriptionKeywords(skill: TranscriptionSkill | undefined): string[] {
  if (!skill) return [];

  const result: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined): void => {
    const keyword = value?.replace(/[<>\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH) return;

    const key = keyword.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(keyword);
  };

  // Expected-answer vocabulary is the most useful signal for recognition, but
  // only retain short phrases. Longer answers are reduced to individual terms.
  for (const question of skill.questions) add(shortPhrase(question.answer));
  add(shortPhrase(skill.title));

  const prioritizedSources = [
    ...skill.questions.map((question) => question.answer),
    skill.title,
    skill.description || '',
    ...skill.questions.map((question) => question.question),
  ];

  for (const source of prioritizedSources) {
    for (const token of keywordTokenCandidates(cleanSkillText(source))) {
      if (isUsefulKeyword(token)) add(token);
      if (result.length >= MAX_TRANSCRIPTION_KEYWORDS) return result;
    }
  }

  return result;
}

export function transcriptionLanguages(detectedLanguage: string | undefined): string[] {
  const detected = detectedLanguage?.trim().toLowerCase();
  return Array.from(new Set([detected, 'en'].filter((language): language is string => Boolean(language))));
}
