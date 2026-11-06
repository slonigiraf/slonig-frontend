// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { parseModelJson } from './modelJson.js';

/**
 * JSON.parse turns the start of some LaTeX commands into control characters:
 * e.g. an unescaped "\\times" becomes TAB + "imes".  At this point the
 * original backslash is lost, so repair only *recognizable* KaTeX commands
 * within <kx> tags. Ordinary whitespace and non-math text stay unchanged.
 */
const ESCAPED_COMMANDS: Record<string, readonly string[]> = {
  '\t': [
    'tan', 'tanh', 'tau', 'text', 'textbf', 'textit', 'textrm', 'textsf', 'texttt',
    'textstyle', 'tfrac', 'theta', 'thetasym', 'therefore', 'thickapprox',
    'thicksim', 'thinspace', 'tilde', 'times', 'tiny', 'to', 'top', 'triangle',
    'triangledown', 'triangleleft', 'triangleq', 'triangleright'
  ],
  '\f': ['fbox', 'flat', 'footnotesize', 'forall', 'frac', 'frown'],
  '\b': [
    'backslash', 'bar', 'begin', 'beta', 'bf', 'big', 'bigcap', 'bigcup', 'bigg',
    'biggl', 'biggr', 'bigl', 'bigodot', 'bigoplus', 'bigotimes', 'bigr',
    'bigsqcup', 'bigvee', 'bigwedge', 'binom', 'bmod', 'bold', 'boldsymbol',
    'bot', 'bowtie', 'boxed', 'brace', 'brack', 'bullet'
  ],
  '\n': [
    'nabla', 'natural', 'ncong', 'ne', 'neq', 'nexists', 'ngeq', 'ngtr',
    'nleftarrow', 'nleftrightarrow', 'nleq', 'nless', 'nmid', 'not',
    'notin', 'notni', 'nparallel', 'nrightarrow', 'nsubseteq',
    'nsupseteq', 'nu'
  ],
  '\r': [
    'raisebox', 'rangle', 'rbrace', 'rbrack', 'rceil', 'rfloor', 'rhd',
    'rho', 'right', 'rightarrow', 'rightharpoondown', 'rightharpoonup',
    'rightsquigarrow', 'risingdotseq', 'rm', 'rule', 'rvert'
  ]
};

const brokenCommand = new RegExp(
  `([\\t\\f\\b\\n\\r])(${Object.values(ESCAPED_COMMANDS).flatMap((commands) => commands.map((command) => command.slice(1))).sort((a, b) => b.length - a.length).join('|')})(?![a-zA-Z])`,
  'g'
);

const commandPrefixes: Record<string, string> = { '\t': 't', '\f': 'f', '\b': 'b', '\n': 'n', '\r': 'r' };
const knownSuffixes = new Map(Object.entries(ESCAPED_COMMANDS).map(([control, commands]) =>
  [control, new Set(commands.map((command) => command.slice(1)))]
));

export interface KaTeXRepairResult {
  /** JSON ready for replaceAbility. Keeps image IDs and all other fields intact. */
  content: string;
  commandsFixed: number;
}

export function fixCorruptedKaTeXText (text: string): { text: string; commandsFixed: number } {
  let commandsFixed = 0;
  const fixed = text.replace(/<kx>[\s\S]*?<\/kx>/g, (math) => math.replace(brokenCommand, (original, control: string, suffix: string) => {
    if (!knownSuffixes.get(control)?.has(suffix)) return original;
    commandsFixed++;

    return `\\${commandPrefixes[control]}${suffix}`;
  }));

  return { text: fixed, commandsFixed };
}

/**
 * Repair previously saved Ability JSON without hydrating its numeric image IDs.
 * Change only recognized broken math commands. A malformed imported JSON blob
 * can also use the existing tolerant parser, then be rewritten as valid JSON.
 */
export function repairStoredAbilityKaTeX (content: string): KaTeXRepairResult | null {
  if (!content.includes('<kx>')) return null;

  let parsed: unknown;
  let rawJsonWasInvalid = false;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    parsed = parseModelJson(content);
    rawJsonWasInvalid = true;
  }

  let commandsFixed = 0;
  const fix = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const corrected = fixCorruptedKaTeXText(value);

      commandsFixed += corrected.commandsFixed;
      return corrected.text;
    }

    if (Array.isArray(value)) return value.map(fix);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, fix(field)]));
    }

    return value;
  };

  const repaired = fix(parsed);

  if (!commandsFixed && !rawJsonWasInvalid) return null;

  return { commandsFixed, content: JSON.stringify(repaired) };
}
