import React, { useCallback, useState } from 'react';
import { useTranslation } from '../translate.js';
import { getSetting, SettingKey, storeSkillTemplate } from '@slonigiraf/db';
import OpenAI from 'openai';
import { FileUpload } from '@polkadot/react-components';
import { skillListPrompt } from '../constants.js';
import { escapeSingleBackslashesInKX, escapeSpecialBackslashesInObject, safeJSONParse } from '../util.js';
import { parseJson } from '@slonigiraf/slonig-components';

interface Props {
  className?: string;
  moduleId: string;
}

const GenerateSkills: React.FC<Props> = ({ className = '', moduleId }: Props) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const example = {
    a: '\tIndented text',
    b: 'Normal text',
    c: '\fPage break',
    nested: { x: '\nNew line', y: 42 },
  };

  const fixed = escapeSpecialBackslashesInObject(example);
  console.log(fixed);


  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
      setOutput('');
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (!file) {
      console.warn('No file selected');
      return;
    }

    const key = await getSetting(SettingKey.OPENAI_TOKEN);
    if (!key) {
      console.error('Missing OpenAI token');
      setOutput('⚠️ No OpenAI token found. Please add it in settings.');
      return;
    }

    const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    const prompt = `${skillListPrompt}\n\nRespond strictly as a JSON array, without markdown formatting or commentary.`;

    try {
      setLoading(true);

      let text = '';

      // --- Handle images with GPT-4o Vision ---
      if (file.type.startsWith('image/')) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const response = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are an AI image analyst. Respond strictly as a JSON array.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: base64 } }
              ]
            }
          ]
        });

        text = response.choices[0].message?.content ?? '';
      } else {
        // --- Handle PDFs, TXT, CSV, etc. ---
        const uploaded = await client.files.create({
          file,
          purpose: 'assistants'
        });

        const response = await client.responses.create({
          model: 'gpt-4.1-mini',
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: prompt },
                { type: 'input_file', file_id: uploaded.id }
              ]
            }
          ]
        });

        text = response.output_text ?? '';
      }

      // --- Parse and store ---
      if (!text) {
        setOutput('❌ No text returned from OpenAI.');
        return;
      }

      // 🧹 Clean up Markdown fences or extra text
      let cleaned = text.trim();

      // Remove ```json ... ``` or ``` ... ``` wrappers
      cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

      // Extract JSON array portion (in case model added intro text)
      const firstBracket = cleaned.indexOf('[');
      const lastBracket = cleaned.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        cleaned = cleaned.slice(firstBracket, lastBracket + 1);
      }

      let parsed: any;
      try {
        parsed = safeJSONParse(cleaned);
      } catch (e) {
        console.error('JSON parse error:', e, text);
        setOutput('❌ Failed to parse OpenAI response as JSON.\n\n' + cleaned);
        return;
      }

      if (!Array.isArray(parsed)) {
        setOutput('❌ OpenAI response is not an array.\n\n' + cleaned);
        return;
      }

      let count = 0;
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          await storeSkillTemplate(moduleId, JSON.stringify(escapeSingleBackslashesInKX(item)));
          count++;
        }
      }

      setOutput(`✅ Stored ${count} skill templates.`);
    } catch (err: any) {
      console.error('OpenAI error:', err);
      setOutput(`❌ OpenAI error: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [file]);

  return (
    <div className='p-4 space-y-4'>
      <h2>{t('Prepare skills for adding')}</h2>

      <FileUpload
        accept="*/*"
        disabled={loading}
        label={t(file ? 'Change file' : 'Upload a file')}
        onChange={handleFileChange}
      />

      {file && (
        <div className='flex flex-col space-y-2'>
          <p>{t('Selected file:')} {file.name}</p>
          <button
            className='px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50'
            onClick={handleSend}
            disabled={loading}
          >
            {loading ? t('Processing...') : t('Send to AI')}
          </button>
        </div>
      )}

      {output && (
        <div className='mt-4 p-3 bg-gray-100 rounded whitespace-pre-wrap'>
          {output}
        </div>
      )}
    </div>
  );
};

export default GenerateSkills;