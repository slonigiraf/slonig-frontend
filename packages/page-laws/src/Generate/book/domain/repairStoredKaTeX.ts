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

// Only collapse duplicate runtime slashes that introduce an actual KaTeX
// command. Do not alter `\\` used as a line break, nor plain text outside <kx>.
// JSON.stringify will still write the single runtime slash as `\\` in JSON.
const OVERESCAPED_COMMANDS = new Set([
  ...Object.values(ESCAPED_COMMANDS).flat(),
  'alpha', 'angle', 'approx', 'arccos', 'arcsin', 'arctan', 'ast',
  'cap', 'cdot', 'cdots', 'chi', 'circ', 'cong', 'cos', 'cosh', 'cot', 'csc', 'cup',
  'dfrac', 'delta', 'Delta', 'div', 'dots', 'downarrow',
  'ell', 'emptyset', 'epsilon', 'equiv', 'eta', 'exists',
  'Gamma', 'gamma', 'ge', 'geq', 'geqslant',
  'hat', 'hbar', 'in', 'infty', 'int', 'iota',
  'kappa', 'Lambda', 'lambda', 'langle', 'lceil', 'ldots', 'le', 'leq', 'leqslant',
  'left', 'leftarrow', 'leftrightarrow', 'lim', 'ln', 'log',
  'mathbb', 'mathbf', 'mathcal', 'mathfrak', 'mathit', 'mathrm', 'mathsf', 'mathtt',
  'mu', 'nabla', 'neg', 'nu', 'odot', 'omega', 'Omega', 'operatorname',
  'oplus', 'otimes', 'overbrace', 'overline', 'overset',
  'partial', 'perp', 'phi', 'Phi', 'pi', 'Pi', 'pm', 'prod', 'propto', 'psi', 'Psi',
  'quad', 'qquad', 'rangle', 'rceil', 'Re', 'rho',
  'sigma', 'Sigma', 'sin', 'sinh', 'sqrt', 'subset', 'subseteq', 'sum', 'supset', 'supseteq',
  'tan', 'tau', 'text', 'theta', 'Theta', 'to', 'triangle',
  'underbrace', 'underline', 'underset', 'uparrow', 'upsilon', 'Upsilon',
  'varepsilon', 'varphi', 'varpi', 'varrho', 'varsigma', 'vartheta',
  'vec', 'vee', 'wedge', 'xi', 'Xi', 'zeta',
  'Rightarrow', 'Leftarrow', 'Leftrightarrow'
]);

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
  const fixed = text.replace(/<kx>[\s\S]*?<\/kx>/g, (math) => {
    const restoredControls = math.replace(brokenCommand, (original, control: string, suffix: string) => {
      if (!knownSuffixes.get(control)?.has(suffix)) return original;
      commandsFixed++;

      return `\\${commandPrefixes[control]}${suffix}`;
    });

    // A previous generation/repair can also leave TWO literal slashes in a
    // decoded text value: <kx>4 \\times 3</kx>. Unlike JSON's required
    // escaping, KaTeX needs one runtime slash. Match exactly two slashes before
    // a known command, preserving any longer runs (e.g. a line break followed
    // by a command) and all other uses of \\ in math.
    return restoredControls.replace(/\\{2,}/g, (slashes: string, offset: number, source: string) => {
      if (slashes.length !== 2) return slashes;

      const nextCommand = /^[a-zA-Z]+/.exec(source.slice(offset + slashes.length))?.[0];

      if (!nextCommand || !OVERESCAPED_COMMANDS.has(nextCommand)) return slashes;
      commandsFixed++;

      return '\\';
    });
  });

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
