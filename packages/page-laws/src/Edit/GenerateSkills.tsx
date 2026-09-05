import React, { useCallback, useState } from 'react';
import { useTranslation } from '../translate.js';
import { getSetting, SettingKey, storeSkillTemplate } from '@slonigiraf/db';
import OpenAI from 'openai';
import { FileUpload } from '@polkadot/react-components';
import { skillListPrompt } from '../constants.js';
import { parseGeneratedSkillTemplates } from '../skillTemplates.js';

interface Props {
  className?: string;
  moduleId: string;
}

const GenerateSkills: React.FC<Props> = ({ className = '', moduleId }: Props) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  
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

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);
    if (!key) {
      console.error('Missing OpenRouter token');
      setOutput('⚠️ No OpenRouter token found. Please add it in settings.');
      return;
    }

    const client = new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-OpenRouter-Title': 'Slonig'
      }
    });
    const prompt = skillListPrompt;

    try {
      setLoading(true);

      let text = '';

      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const fileContent = file.type.startsWith('image/')
        ? { type: 'image_url', image_url: { url: fileData } }
        : { type: 'file', file: { filename: file.name, file_data: fileData } };
      const response = await client.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Respond strictly as a JSON array.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              fileContent
            ] as any
          }
        ]
      });

      text = response.choices[0].message?.content ?? '';

      // --- Parse and store ---
      if (!text) {
        setOutput('❌ No text returned from OpenRouter.');
        return;
      }

      const templates = parseGeneratedSkillTemplates(text);

      for (const template of templates) {
        await storeSkillTemplate(moduleId, JSON.stringify(template));
      }

      setOutput(`✅ Stored ${templates.length} skill templates.`);
    } catch (err: any) {
      console.error('OpenRouter error:', err);
      setOutput(`❌ OpenRouter error: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [file, moduleId]);

  return (
    <div className='p-4 space-y-4'>
      <h2>{t('Templates of skills:')}</h2>

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
