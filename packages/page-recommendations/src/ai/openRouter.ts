export interface OpenRouterSettings {
  apiKey: string;
  model?: string;
  siteUrl?: string;
  siteName?: string;
}

export interface TutorMessageResponse {
  message: string;
}

export interface TutorDecisionResponse {
  nextStage: number;
}

export type TutorTurn = TutorMessageResponse | TutorDecisionResponse;

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
// GPT Transcribe is OpenRouter's current high-accuracy general STT option and
// keeps the tutor's broad language support without a second provider SDK.
const DEFAULT_TRANSCRIPTION_MODEL = 'openai/gpt-transcribe';
// OpenAI TTS is no longer in OpenRouter's live speech catalog. Grok Voice is a
// current multilingual option with stable voice IDs and automatic language detection.
const DEFAULT_SPEECH_MODEL = 'x-ai/grok-voice-tts-1.0';
const DEFAULT_SPEECH_VOICE = 'eve';
const DEFAULT_IMAGE_MODEL = 'openai/gpt-image-2';

function extractJson(text: string, responseKind: 'message'): TutorMessageResponse;
function extractJson(text: string, responseKind: 'nextStage'): TutorDecisionResponse;
function extractJson(text: string, responseKind: 'message' | 'nextStage'): TutorTurn {
  const candidate = text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error('The tutor returned no JSON response.');

  const parsed = JSON.parse(candidate) as Record<string, unknown>;
  const keys = Object.keys(parsed);

  if (responseKind === 'nextStage') {
    if (keys.length !== 1 || keys[0] !== 'nextStage') {
      throw new Error('The tutor decision response must contain only nextStage.');
    }
    if (typeof parsed.nextStage !== 'number' || !Number.isInteger(parsed.nextStage)) {
      throw new Error('The tutor decision response has no integer nextStage index.');
    }
    return { nextStage: parsed.nextStage };
  }

  if (keys.length !== 1 || keys[0] !== 'message') {
    throw new Error('The tutor stage-text response must contain only message.');
  }
  if (typeof parsed.message !== 'string') {
    throw new Error('The tutor stage-text response has no message.');
  }
  return { message: parsed.message };
}

interface OpenRouterErrorMetadata {
  provider_name?: string;
  raw?: unknown;
}

interface OpenRouterErrorPayload {
  error?: {
    message?: string;
    metadata?: OpenRouterErrorMetadata;
  } | string;
}

function upstreamErrorDetail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    if (typeof parsed.error === 'string') return parsed.error;
    if (typeof parsed.error?.message === 'string') return parsed.error.message;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    // The provider can return plain text instead of JSON.
  }

  return trimmed;
}

async function responseError(response: Response): Promise<Error> {
  const errorBody = await response.text();
  let detail = errorBody;

  try {
    const parsed = JSON.parse(errorBody) as OpenRouterErrorPayload;
    if (typeof parsed.error === 'string') {
      detail = parsed.error;
    } else if (parsed.error) {
      const message = parsed.error.message || '';
      const provider = parsed.error.metadata?.provider_name;
      const upstream = upstreamErrorDetail(parsed.error.metadata?.raw);
      const providerPrefix = provider ? `${provider}: ` : '';
      detail = upstream
        ? `${message || 'Provider returned error'} (${providerPrefix}${upstream})`
        : message || errorBody;
    }
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

function isSvgAttachment(attachment: OpenRouterAttachment): boolean {
  return attachment.mimeType.toLowerCase().startsWith('image/svg+xml')
    || attachment.dataUrl.toLowerCase().startsWith('data:image/svg+xml');
}

function textFromDataUrl(dataUrl: string, name: string): string {
  const separator = dataUrl.indexOf(',');
  if (separator < 0) throw new Error(`Unable to read SVG source from ${name}.`);

  const metadata = dataUrl.slice(0, separator);
  const payload = dataUrl.slice(separator + 1);
  try {
    if (/;base64(?:;|$)/i.test(metadata)) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    throw new Error(`Unable to decode SVG source from ${name}.`);
  }
}

export function askOpenRouter(
  settings: OpenRouterSettings,
  prompt: string,
  signal?: AbortSignal,
  attachments?: OpenRouterAttachment[],
): Promise<TutorMessageResponse>;
export function askOpenRouter(
  settings: OpenRouterSettings,
  prompt: string,
  signal: AbortSignal | undefined,
  attachments: OpenRouterAttachment[],
  responseKind: 'nextStage',
): Promise<TutorDecisionResponse>;
export async function askOpenRouter(
  settings: OpenRouterSettings,
  prompt: string,
  signal?: AbortSignal,
  attachments: OpenRouterAttachment[] = [],
  responseKind: 'message' | 'nextStage' = 'message',
): Promise<TutorTurn> {
  let content: string | Array<Record<string, unknown>> = prompt;
  if (attachments.length > 0) {
    const parts: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    attachments.forEach((attachment) => {
      if (isSvgAttachment(attachment)) {
        // Vision providers such as Azure do not accept SVG image payloads. Keep
        // the original vector source intact and let the model inspect it as text.
        parts.push({
          type: 'text',
          text: `Attached SVG source: ${attachment.name}\n${textFromDataUrl(attachment.dataUrl, attachment.name)}`,
        });
      } else if (attachment.kind === 'image') {
        parts.push(
          { type: 'text', text: `Attached image: ${attachment.name}` },
          { type: 'image_url', image_url: { url: attachment.dataUrl } },
        );
      } else {
        parts.push(
          { type: 'text', text: `Attached file: ${attachment.name}` },
          {
            type: 'file',
            file: {
              filename: attachment.name,
              file_data: attachment.dataUrl,
            },
          },
        );
      }
    });
    content = parts;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: headers(settings),
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      // The AI Tutor already requires a single JSON object in every prompt and
      // validates the parsed shape below. Avoid provider-specific sampling and
      // response-format parameters here: the model picker can select providers
      // whose multimodal endpoints do not accept those optional parameters.
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const contentText = payload.choices?.[0]?.message?.content;
  if (!contentText) throw new Error('OpenRouter returned an empty response.');

  return responseKind === 'nextStage'
    ? extractJson(contentText, 'nextStage')
    : extractJson(contentText, 'message');
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

export interface OpenRouterTranscriptionHints {
  keywords?: string[];
  languages?: string[];
  prompt?: string;
}

export async function transcribeOpenRouter(
  settings: OpenRouterSettings,
  audio: Blob,
  signal?: AbortSignal,
  hints?: OpenRouterTranscriptionHints,
): Promise<string> {
  const body = JSON.stringify({
    model: DEFAULT_TRANSCRIPTION_MODEL,
    input_audio: {
      data: await blobToBase64(audio),
      format: audioFormatFromMime(audio.type),
    },
    ...(hints?.prompt ? { prompt: hints.prompt } : {}),
    ...(hints?.keywords?.length ? { keywords: hints.keywords } : {}),
    ...(hints?.languages?.length ? { languages: hints.languages } : {}),
    // A deterministic transcription is preferable for grading/classification.
    temperature: 0,
  });

  // OpenRouter/provider routing can occasionally return a successful response
  // with an empty transcript for a valid short recording. Retry that corner
  // case once, then let the caller decide whether an empty transcript is usable
  // alongside typed text or attachments.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      signal,
      headers: headers(settings),
      body,
    });

    if (!response.ok) throw await responseError(response);
    const payload = await response.json() as { text?: string };
    const transcript = payload.text?.trim() || '';
    if (transcript) return transcript;
  }

  return '';
}

export async function synthesizeOpenRouterSpeech(
  settings: OpenRouterSettings,
  text: string,
  signal?: AbortSignal,
  voice = DEFAULT_SPEECH_VOICE,
): Promise<Blob> {
  const input = text.trim();
  if (!input) throw new Error('Cannot synthesize empty tutor speech.');

  const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    signal,
    headers: headers(settings),
    body: JSON.stringify({
      model: DEFAULT_SPEECH_MODEL,
      input,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) throw await responseError(response);
  const bytes = await response.blob();
  if (bytes.size === 0) throw new Error('OpenRouter returned empty speech audio.');
  return bytes.type ? bytes : new Blob([bytes], { type: 'audio/mpeg' });
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

export { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_SPEECH_MODEL, DEFAULT_SPEECH_VOICE, DEFAULT_TRANSCRIPTION_MODEL };
