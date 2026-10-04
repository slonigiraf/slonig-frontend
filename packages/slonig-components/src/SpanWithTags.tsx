import React from 'react';
import { InlineMath } from 'react-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  content: string;
}

const SpanWithTags: React.FC<Props> = ({ content }) => {
  const parseContent = (value: string): React.ReactNode[] => {
    const regex =
      /```([a-zA-Z0-9_-]+)?[ \t]*\n([\s\S]*?)```|<kx>([\s\S]*?)<\/kx>|<code>([\s\S]*?)<\/code>/g;

    const result: React.ReactNode[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(value)) !== null) {
      const offset = match.index;

      // Add plain text before the current match
      if (offset > lastIndex) {
        result.push(
          <span key={`text-${lastIndex}`}>
            {value.slice(lastIndex, offset)}
          </span>
        );
      }

      const language = match[1];
      const code = match[2];
      const katex = match[3];
      const inlineCode = match[4];

      // Render fenced code block
      if (code !== undefined) {
        result.push(
          <div
            key={`code-${offset}`}
            style={{
              margin: '12px 0',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fafafa',
            }}
          >
            {language && (
              <div
                style={{
                  padding: '6px 12px',
                  background: '#f3f4f6',
                  borderBottom: '1px solid #e5e7eb',
                  color: '#6b7280',
                  fontSize: 12,
                  lineHeight: 1.4,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                }}
              >
                {language}
              </div>
            )}

            <SyntaxHighlighter
              language={language || 'text'}
              style={vs}
              customStyle={{
                margin: 0,
                padding: '14px 16px',
                background: '#fafafa',
                fontSize: 14,
                lineHeight: 1.6,
              }}
              codeTagProps={{
                style: {
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                },
              }}
              wrapLongLines
            >
              {code.trimEnd()}
            </SyntaxHighlighter>
          </div>
        );
      }

      // Render inline code
      else if (inlineCode !== undefined) {
        result.push(
          <code key={`inline-code-${offset}`}>
            {inlineCode}
          </code>
        );
      }

      // Render KaTeX
      else if (katex !== undefined) {
        result.push(
          <InlineMath
            key={`katex-${offset}`}
            math={katex.trim()}
          />
        );
      }

      lastIndex = offset + match[0].length;
    }

    // Add any remaining text
    if (lastIndex < value.length) {
      result.push(
        <span key={`text-${lastIndex}`}>
          {value.slice(lastIndex)}
        </span>
      );
    }

    return result;
  };

  if (!content) {
    return null;
  }

  return (
    <span
      style={{
        whiteSpace: 'pre-wrap',
      }}
    >
      {parseContent(content)}
    </span>
  );
};

export default React.memo(SpanWithTags);
