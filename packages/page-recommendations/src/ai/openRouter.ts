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

export interface OpenRouterAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
  kind: 'image' | 'file';
}

export interface GeneratedImage {
  dataUrl: string;
  mimeType: string;
}

const DEFAULT_MODEL = 'openai/gpt-6-luna';
const DEFAULT_TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe';
const DEFAULT_IMAGE_MODEL = 'openai/gpt-image-2';

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

async function responseError(response: Response): Promise<Error> {
  const errorBody = await response.text();
  let detail = errorBody;

  try {
    const parsed = JSON.parse(errorBody) as { error?: { message?: string } | string };
    detail = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message || errorBody;
  } catch {
    // Keep the plain response text when the gateway did not return JSON.
  }

  return new Error(`OpenRouter request failed (${response.status})${detail ? `: ${detail}` : '.'}`);
}

function headers(settings: OpenRouterSettings): Record<string, string> {
  return {
    Authorization: `Bearer ${settings.apiKey}`,
    'Content-Type': 'application/json',
    ...(settings.siteUrl ? { 'HTTP-Referer': settings.siteUrl } : {}),
    ...(settings.siteName ? { 'X-OpenRouter-Title': settings.siteName } : {}),
  };
}

export async function askOpenRouter(
  settings: OpenRouterSettings,
  prompt: string,
  signal?: AbortSignal,
  attachments: OpenRouterAttachment[] = [],
): Promise<TutorTurn> {
  const content = attachments.length === 0
    ? prompt
    : [
      { type: 'text', text: prompt },
      ...attachments.map((attachment) => attachment.kind === 'image'
        ? {
          type: 'image_url',
          image_url: { url: attachment.dataUrl },
        }
        : {
          type: 'file',
          file: {
            filename: attachment.name,
            file_data: attachment.dataUrl,
          },
        }),
    ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: headers(settings),
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const contentText = payload.choices?.[0]?.message?.content;
  if (!contentText) throw new Error('OpenRouter returned an empty response.');
  return extractJson(contentText);
}

function audioFormatFromMime(mimeType: string): string {
  const mime = mimeType.toLowerCase().split(';', 1)[0].trim();
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  // MediaRecorder reports `audio/mp4` on Safari/iOS, while OpenRouter's
  // transcription API expects the matching audio container token as `m4a`.
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('aac')) return 'aac';
  return 'webm';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export async function transcribeOpenRouter(
  settings: OpenRouterSettings,
  audio: Blob,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    signal,
    headers: headers(settings),
    body: JSON.stringify({
      model: DEFAULT_TRANSCRIPTION_MODEL,
      input_audio: {
        data: await blobToBase64(audio),
        format: audioFormatFromMime(audio.type),
      },
    }),
  });

  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { text?: string };
  if (!payload.text?.trim()) throw new Error('OpenRouter returned an empty audio transcription.');
  return payload.text.trim();
}

export async function generateOpenRouterImage(
  settings: OpenRouterSettings,
  prompt: string,
  signal?: AbortSignal,
): Promise<GeneratedImage> {
  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    signal,
    headers: headers(settings),
    body: JSON.stringify({
      model: DEFAULT_IMAGE_MODEL,
      prompt,
      aspect_ratio: '1:1',
    }),
  });

  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { data?: Array<{ b64_json?: string; media_type?: string }> };
  const image = payload.data?.[0];
  if (!image?.b64_json) throw new Error('OpenRouter returned no generated image.');
  const mimeType = image.media_type || 'image/png';
  return {
    mimeType,
    dataUrl: `data:${mimeType};base64,${image.b64_json}`,
  };
}

export { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_TRANSCRIPTION_MODEL };
