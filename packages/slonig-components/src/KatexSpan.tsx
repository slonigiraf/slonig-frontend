import React from 'react';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

interface Props {
  content: string;
}

const KatexSpan: React.FC<Props> = ({ content }) => {
  // Function to split the content into KaTeX and non-KaTeX parts
  const parseContent = (content: string): React.ReactNode[] => {
    const regex = /<kx>(.*?)<\/kx>/g;
    let result: React.ReactNode[] = [];
    let lastIndex = 0;

    content.replace(regex, (match, p1, offset) => {
      // Add text before the KaTeX element as a span (if not empty)
      if (offset > lastIndex) {
        result.push(<span key={`text-${lastIndex}`}>{content.substring(lastIndex, offset)}</span>);
      }
      // Add the KaTeX element
      result.push(<InlineMath key={`katex-${offset}`} math={p1} />);
      lastIndex = offset + match.length;
      return match; // This return value is not used
    });

    // Add any remaining text after the last KaTeX element as a span
    if (lastIndex < content.length) {
      result.push(<span key={`text-${lastIndex}`}>{content.substring(lastIndex)}</span>);
    }

    return result;
  };

  return (
    <span>
      {parseContent(content)}
    </span>
  );
};

export default React.memo(KatexSpan);