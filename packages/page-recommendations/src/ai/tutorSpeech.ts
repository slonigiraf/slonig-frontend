const KATEX_TAG = /<kx>([\s\S]*?)<\/kx>/gi;

function stripSpeechMarkdown(value: string): string {
  return value
    .replace(/[*_#`]/g, '')
    .replace(/(^|\s)>+\s?/g, '$1');
}

function tutorMessageTextOnly(value: string): string {
  const withoutCodeOrTikz = value
    .replace(
      /```[A-Za-z0-9_+-]*\s*\\begin\s*\{tikzpicture\}[\s\S]*?\\end\s*\{tikzpicture\}\s*```|\\begin\s*\{tikzpicture\}[\s\S]*?\\end\s*\{tikzpicture\}/gi,
      ' ',
    )
    .replace(/```[\s\S]*?```/g, ' ');

  KATEX_TAG.lastIndex = 0;
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = KATEX_TAG.exec(withoutCodeOrTikz)) !== null) {
    result += stripSpeechMarkdown(withoutCodeOrTikz.slice(cursor, match.index));
    result += match[0];
    cursor = KATEX_TAG.lastIndex;
  }
  result += stripSpeechMarkdown(withoutCodeOrTikz.slice(cursor));

  return result.replace(/\s+/g, ' ').trim();
}

export function tutorSpeechSourceText(value: string): string {
  return tutorMessageTextOnly(value);
}

export function tutorSpeechHasKatex(value: string): boolean {
  KATEX_TAG.lastIndex = 0;
  return KATEX_TAG.test(value);
}

interface BracedGroup {
  end: number;
  value: string;
}

function bracedGroupAt(value: string, start: number): BracedGroup | undefined {
  if (value[start] !== '{') return undefined;

  let depth = 0;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (char === '{' && value[index - 1] !== '\\') depth += 1;
    if (char === '}' && value[index - 1] !== '\\') {
      depth -= 1;
      if (depth === 0) return { end: index + 1, value: value.slice(start + 1, index) };
    }
  }

  return undefined;
}

function replaceTwoGroupCommand(value: string, command: string, render: (left: string, right: string) => string): string {
  let result = value;
  let cursor = 0;

  while (cursor < result.length) {
    const commandIndex = result.indexOf(command, cursor);
    if (commandIndex < 0) break;

    let groupStart = commandIndex + command.length;
    while (/\s/.test(result[groupStart] || '')) groupStart += 1;
    const left = bracedGroupAt(result, groupStart);
    if (!left) {
      cursor = commandIndex + command.length;
      continue;
    }

    groupStart = left.end;
    while (/\s/.test(result[groupStart] || '')) groupStart += 1;
    const right = bracedGroupAt(result, groupStart);
    if (!right) {
      cursor = commandIndex + command.length;
      continue;
    }

    result = `${result.slice(0, commandIndex)}${render(left.value, right.value)}${result.slice(right.end)}`;
    cursor = commandIndex + 1;
  }

  return result;
}

function replaceOneGroupCommand(value: string, command: string, render: (content: string) => string): string {
  let result = value;
  let cursor = 0;

  while (cursor < result.length) {
    const commandIndex = result.indexOf(command, cursor);
    if (commandIndex < 0) break;

    let groupStart = commandIndex + command.length;
    while (/\s/.test(result[groupStart] || '')) groupStart += 1;
    const group = bracedGroupAt(result, groupStart);
    if (!group) {
      cursor = commandIndex + command.length;
      continue;
    }

    result = `${result.slice(0, commandIndex)}${render(group.value)}${result.slice(group.end)}`;
    cursor = commandIndex + 1;
  }

  return result;
}

const SYMBOL_COMMANDS: Record<string, string> = {
  approx: '≈',
  cdot: '×',
  cong: '≅',
  div: '÷',
  ge: '≥',
  geq: '≥',
  gt: '>',
  in: '∈',
  infty: '∞',
  le: '≤',
  leq: '≤',
  lt: '<',
  mp: '∓',
  ne: '≠',
  neq: '≠',
  notin: '∉',
  parallel: '∥',
  perp: '⊥',
  pm: '±',
  sim: '∼',
  times: '×',
  to: '→',
};

const GREEK_COMMANDS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

export function katexToSpeechFallback(katex: string): string {
  let value = katex.trim();

  for (let pass = 0; pass < 8; pass++) {
    const previous = value;
    value = replaceTwoGroupCommand(value, '\\frac', (numerator, denominator) => `(${katexToSpeechFallback(numerator)}) ÷ (${katexToSpeechFallback(denominator)})`);
    value = replaceTwoGroupCommand(value, '\\dfrac', (numerator, denominator) => `(${katexToSpeechFallback(numerator)}) ÷ (${katexToSpeechFallback(denominator)})`);
    value = replaceTwoGroupCommand(value, '\\tfrac', (numerator, denominator) => `(${katexToSpeechFallback(numerator)}) ÷ (${katexToSpeechFallback(denominator)})`);
    value = replaceOneGroupCommand(value, '\\sqrt', (content) => `√(${katexToSpeechFallback(content)})`);
    value = replaceOneGroupCommand(value, '\\text', (content) => content);
    value = replaceOneGroupCommand(value, '\\mathrm', (content) => content);
    value = replaceOneGroupCommand(value, '\\mathbf', (content) => content);
    value = replaceOneGroupCommand(value, '\\operatorname', (content) => content);
    if (value === previous) break;
  }

  value = value
    .replace(/\\left\b|\\right\b/g, '')
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\!/g, '')
    .replace(/\\([A-Za-z]+)/g, (_match, command: string) => SYMBOL_COMMANDS[command] || GREEK_COMMANDS[command] || command)
    .replace(/\^\{2\}/g, '²')
    .replace(/\^\{3\}/g, '³')
    .replace(/_\{([^{}]+)\}/g, '_($1)')
    .replace(/\^\{([^{}]+)\}/g, '^($1)')
    .replace(/[{}]/g, '')
    .replace(/\s*([=+−\-×÷<>≤≥≠±∓≈])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();

  return value;
}

export function tutorSpeechFallbackText(sourceText: string): string {
  KATEX_TAG.lastIndex = 0;
  return sourceText
    .replace(KATEX_TAG, (_match, katex: string) => katexToSpeechFallback(katex))
    .replace(/<\/?kx>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tutorSpeechRewriteIsSafe(value: string): boolean {
  return !/<\/?kx>/i.test(value)
    && !/\\[A-Za-z]+/.test(value)
    && !/[{}]/.test(value);
}

export function tutorSpeechRewritePrompt(sourceText: string, languageName: string): string {
  return `Prepare this tutor message for text-to-speech in ${languageName}.

The source uses <kx>...</kx> around KaTeX/LaTeX mathematics. Convert every such expression into natural spoken mathematics in ${languageName}, while preserving the mathematical meaning exactly. Keep the ordinary prose in its current language and wording as much as possible.

Rules:
- Return only JSON with exactly this shape: {"message":"..."}.
- Remove all <kx> tags and all LaTeX syntax from the spoken message.
- Never say markup or command names such as "kx", "backslash", "frac", "sqrt", braces, or delimiters.
- Read fractions, roots, powers, subscripts, equations, inequalities, operators, coordinates, units, and Greek letters naturally and unambiguously.
- Do not solve, simplify, correct, translate, or otherwise change the mathematics.
- Preserve the order and meaning of the tutor's prose. Do not add explanations or commentary.
- Make punctuation suitable for natural pauses in speech.

Source tutor message as a JSON string:
${JSON.stringify(sourceText)}`;
}

/**
 * Split long tutor speech at natural punctuation so the first TTS request is
 * small enough to start quickly. The caller can prefetch the next chunk while
 * the current one is playing. This intentionally operates on already-cleaned
 * spoken text, not on the visible tutor message/KaTeX source.
 */
export function tutorSpeechChunks(value: string, maxChars = 280): string[] {
  const input = value.replace(/\s+/g, ' ').trim();
  if (!input) return [];
  if (input.length <= maxChars) return [input];

  const sentences = input.match(/[^.!?。！？]+(?:[.!?。！？]+["'”’）)\]]*|$)/gu)
    ?.map((part) => part.trim())
    .filter(Boolean) || [input];

  const pieces: string[] = [];
  const pushLongPart = (part: string): void => {
    if (part.length <= maxChars) {
      pieces.push(part);
      return;
    }

    const words = part.split(/\s+/);
    let current = '';
    words.forEach((word) => {
      if (word.length > maxChars) {
        if (current) {
          pieces.push(current);
          current = '';
        }
        for (let offset = 0; offset < word.length; offset += maxChars) {
          pieces.push(word.slice(offset, offset + maxChars));
        }
        return;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        pieces.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) pieces.push(current);
  };

  sentences.forEach(pushLongPart);

  const chunks: string[] = [];
  let current = '';
  pieces.forEach((piece) => {
    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = piece;
    } else {
      current = candidate;
    }
  });
  if (current) chunks.push(current);

  return chunks;
}
