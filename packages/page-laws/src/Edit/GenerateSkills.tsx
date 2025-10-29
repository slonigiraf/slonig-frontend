import React, { useCallback, useState } from 'react';
import { useTranslation } from '../translate.js';
import { getSetting, SettingKey } from '@slonigiraf/db';
import OpenAI from 'openai';
import { FileUpload } from '@polkadot/react-components';

const LearnWithAI: React.FC = () => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
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
      return;
    }

    const client = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    const prompt = 'Summarize the contents of this file:';

    try {
      setLoading(true);

      // Upload the file first
      const uploaded = await client.files.create({
        file,
        purpose: 'assistants'
      });

      // Correct input format for `responses.create`
      const response = await client.responses.create({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            // ✅ Use an array of simple objects, not unioned inline type
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_file', file_id: uploaded.id }
            ]
          }
        ]
      });

      const text = response.output_text ?? '(no text output)';
      console.log('AI Output:', text);
      setOutput(text);
    } catch (err) {
      console.error('OpenAI error:', err);
      setOutput('Error communicating with AI. Check console for details.');
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