import React, { useCallback, useState } from 'react';
import { useTranslation } from '../translate.js';
import { FileUpload } from '@polkadot/react-components';
import OpenAI from 'openai';
import { getSetting, SettingKey } from '@slonigiraf/db';

const LearnWithAI: React.FC = () => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = useCallback((files: File[]) => {
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

    const prompt = 'Analyze the uploaded file and summarize its content.';

    console.log('Uploading file to OpenAI...');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an AI file analyst.' },
          { role: 'user', content: prompt },
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                name: file.name,
                mime_type: file.type || 'application/octet-stream',
                data: await file.arrayBuffer()
              }
            ]
          }
        ]
      });

      console.log('AI Output:', response.choices[0].message?.content);
    } catch (err) {
      console.error('OpenAI error:', err);
    }
  }, [file]);

  return (
    <div className='p-4 space-y-4'>
      <h2 className='text-xl font-semibold'>{t('Learn with AI')}</h2>
      <FileUpload label={t('Upload a file')} onChange={handleFileChange} />
      {file && (
        <div className='flex flex-col space-y-2'>
          <p>{t('Selected file:')} {file.name}</p>
          <button
            className='px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600'
            onClick={handleSend}
          >
            {t('Send to AI')}
          </button>
        </div>
      )}
    </div>
  );
};

export default LearnWithAI;