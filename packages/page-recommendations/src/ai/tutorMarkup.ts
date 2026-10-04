const LATEX_TEXT_COMMAND = /\\(?:text|textrm|textbf|textit|mathrm|mathbf|mathit|operatorname)\s*\{[^{}]*\}/g;
const LATEX_COMMAND = /\\[A-Za-z]+/g;
const WORD_LIKE_TOKEN = /[\p{L}]{2,}/gu;
const CODE_LIKE_KATEX = /(?:=>|===|!==|==|!=|&&|\|\||\b(?:const|let|var|function|return|import|export|from|class|interface|type|new|async|await)\b|\b[A-Za-z_$][\w$]*(?:[A-Z][\w$]*)+\b|(?:^|[^\\\w$])[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\([^)]*\)|\b(?:onClick|onChange|onSubmit|setState)\s*=|<[A-Za-z][A-Za-z0-9._:-]*(?:\s|\/?>)|['"][^'"\n]*['"])/;
const GENERATED_MARKUP_TOKEN = /```(?:[a-zA-Z0-9_-]+)?[ \t]*\n[\s\S]*?```|``(?:(?!``)[^\n])+``|`[^`\n]+`|<kx>([\s\S]*?)<\/kx>/g;

function shouldKeepGeneratedKatex(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed) return false;

  // Ignore prose intentionally embedded with LaTeX text commands while looking
  // for source-code signals. This keeps expressions such as
  // \text{speed} = d/t valid without letting JavaScript through as math.
  const codeProbe = trimmed.replace(LATEX_TEXT_COMMAND, '');
  if (CODE_LIKE_KATEX.test(codeProbe)) return false;

  const hasLatexCommand = /\\[A-Za-z]+/.test(trimmed);
  const wordProbe = codeProbe.replace(LATEX_COMMAND, '');
  const words = wordProbe.match(WORD_LIKE_TOKEN) ?? [];

  // Without explicit LaTeX commands, generated math should consist of numbers,
  // operators, punctuation, and single-letter variables. Multi-letter tokens
  // are far more likely to be prose, identifiers, component names, or units.
  if (!hasLatexCommand) return words.length === 0;

  // LaTeX commands can legitimately take descriptive arguments (for example
  // \frac{distance}{time}), but a long run of ordinary words is still prose.
  return words.length < 4;
}

/**
 * Removes accidental <kx> wrappers from model-generated prose/source code while
 * preserving real math and leaving Markdown code spans/fences untouched.
 */
export function sanitizeGeneratedTutorMarkup(value: string): string {
  return value.replace(GENERATED_MARKUP_TOKEN, (match, katex: string | undefined) => {
    if (katex === undefined) return match;

    return shouldKeepGeneratedKatex(katex) ? match : katex;
  });
}
