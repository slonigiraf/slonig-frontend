import React, { useCallback, useState } from 'react';
import { useTranslation } from '../translate.js';
import { getSetting, SettingKey } from '@slonigiraf/db';
import OpenAI from 'openai';
import { FileUpload } from '@polkadot/react-components';
import { skillListPrompt } from '../constants.js';

const LearnWithAI: React.FC = () => {
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

    const key = await getSetting(SettingKey.OPENAI_TOKEN);
    if (!key) {
      console.error('Missing OpenAI token');
      setOutput('⚠️ No OpenAI token found. Please add it in settings.');
      return;
    }

    const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    const prompt = skillListPrompt;

    try {
      setLoading(true);

      // --- Handle images with GPT-4o Vision ---
      if (file.type.startsWith('image/')) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });

        const response = await client.chat.completions.create({
          model: 'gpt-4o-mini', // supports vision
          messages: [
            { role: 'system', content: 'You are an AI image analyst.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: base64 } } // ✅ correct shape
              ]
            }
          ]
        });

        const text = response.choices[0].message?.content ?? '(no response)';
        console.log('AI Output (image):', text);
        setOutput(text);
        return;
      }

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

      const text = response.output_text ?? '(no text output)';
      console.log('AI Output (file):', text);
      setOutput(text);
    } catch (err: any) {
      console.error('OpenAI error:', err);
      setOutput(`❌ OpenAI error: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [file]);

  return (
    <div className='p-4 space-y-4'>
      <h2 className='text-xl font-semibold'>{t('Learn with AI')}</h2>

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

export default LearnWithAI;