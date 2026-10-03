import { katexToSpeechFallback, tutorSpeechFallbackText, tutorSpeechHasKatex, tutorSpeechRewriteIsSafe, tutorSpeechRewritePrompt, tutorSpeechSourceText } from './tutorSpeech.js';

describe('AI Tutor speech text', (): void => {
  it('keeps kx formulas in the rewrite source while removing markdown and code', (): void => {
    const source = tutorSpeechSourceText('**Solve** <kx>x_{1} = \\frac{1}{3}</kx>. ```js\nconst x = 1;\n```');

    expect(source).toBe('Solve <kx>x_{1} = \\frac{1}{3}</kx>.');
    expect(tutorSpeechHasKatex(source)).toBe(true);
  });

  it('creates a safe language-aware math rewrite prompt', (): void => {
    const prompt = tutorSpeechRewritePrompt('The answer is <kx>1 \\div 3 = \\frac{1}{3}</kx>.', 'Spanish');

    expect(prompt).toContain('text-to-speech in Spanish');
    expect(prompt).toContain('natural spoken mathematics in Spanish');
    expect(prompt).toContain('"The answer is <kx>1 \\\\div 3 = \\\\frac{1}{3}</kx>."');
    expect(prompt).toContain('Do not solve, simplify, correct, translate');
    expect(tutorSpeechRewriteIsSafe('one third')).toBe(true);
    expect(tutorSpeechRewriteIsSafe('\\frac{1}{3}')).toBe(false);
  });

  it('uses symbols instead of LaTeX command names in the fallback', (): void => {
    expect(katexToSpeechFallback('1 \\div 3 = \\frac{1}{3}')).toBe('1 ÷ 3 = (1) ÷ (3)');
    expect(katexToSpeechFallback('2 \\times 1000 = 2000')).toBe('2 × 1000 = 2000');
    expect(katexToSpeechFallback('\\sqrt{x^2}')).toBe('√(x^2)');
  });

  it('never leaves kx tags or common LaTeX commands in fallback speech', (): void => {
    const spoken = tutorSpeechFallbackText('The reciprocal is <kx>\\frac{1}{3}</kx>, and <kx>x \\leq 4</kx>.');

    expect(spoken).toBe('The reciprocal is (1) ÷ (3), and x ≤ 4.');
    expect(spoken).not.toContain('<kx>');
    expect(spoken).not.toContain('\\frac');
    expect(spoken).not.toContain('\\leq');
  });
});
