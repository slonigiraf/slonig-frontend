export interface OpenRouterSettings {
  apiKey: string;
  model?: string;
  siteUrl?: string;
  siteName?: string;
}

export interface TutorTurn {
  message: string;
  nextStage?: number;
  exercise?: string;
  answer?: string;
  decision: 'continue' | 'mastered' | 'repeat' | 'skip';
  feedback?: string;
}

const DEFAULT_MODEL = 'openai/gpt-6-luna';

function extractJson(text: string): TutorTurn {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error('The tutor returned no JSON response.');

  const parsed = JSON.parse(candidate) as Partial<TutorTurn>;
  if (typeof parsed.message !== 'string') throw new Error('The tutor response has no message.');

  return {
    message: parsed.message,
    nextStage: typeof parsed.nextStage === 'number' ? parsed.nextStage : undefined,
    exercise: typeof parsed.exercise === 'string' ? parsed.exercise : undefined,
    answer: typeof parsed.answer === 'string' ? parsed.answer : undefined,
    feedback: typeof parsed.feedback === 'string' ? parsed.feedback : undefined,
    decision: parsed.decision === 'skip' || parsed.decision === 'mastered' || parsed.decision === 'repeat'
      ? parsed.decision
      : 'continue',
  };
}

export async function askOpenRouter(
  settings: OpenRouterSettings,
  prompt: string,
  signal?: AbortSignal,
): Promise<TutorTurn> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
      ...(settings.siteUrl ? { 'HTTP-Referer': settings.siteUrl } : {}),
      ...(settings.siteName ? { 'X-OpenRouter-Title': settings.siteName } : {}),
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let detail = errorBody;

    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } | string };
      detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message || errorBody;
    } catch {
      // Keep the plain response text when the gateway did not return JSON.
    }

    throw new Error(`OpenRouter request failed (${response.status})${detail ? `: ${detail}` : '.'}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response.');
  return extractJson(content);
}

export { DEFAULT_MODEL };
