import { ReactNode } from 'react';

interface LinkifiedTextProps {
  text: string;
}

function trimUrlPunctuation(value: string): string {
  let trimmed = value.replace(/[.,!?;:。！？、]+$/u, '');
  const delimiters = [['(', ')'], ['[', ']'], ['{', '}']];
  let previous: string;

  do {
    previous = trimmed;
    for (let index = 0; index < delimiters.length; index += 1) {
      const [opening, closing] = delimiters[index];
      if (trimmed.endsWith(closing)
        && trimmed.split(closing).length > trimmed.split(opening).length) {
        trimmed = trimmed.slice(0, -1);
      }
    }
    trimmed = trimmed.replace(/[.,!?;:。！？、]+$/u, '');
  } while (trimmed !== previous);

  return trimmed;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function LinkifiedText({ text }: LinkifiedTextProps): JSX.Element {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))*)\)|https?:\/\/[^\s<>"'`“”‘’]+/gi;
  let offset = 0;

  Array.from(text.matchAll(pattern)).forEach((match) => {
    const start = match.index ?? 0;
    const [token, label, destination] = match;
    const href = destination === undefined ? trimUrlPunctuation(token) : destination;

    parts.push(text.slice(offset, start));
    if (isWebUrl(href)) {
      parts.push(
        <a
          key={start}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={href}
          onClick={(event) => event.stopPropagation()}
          style={{ color: 'inherit', textDecoration: 'underline', overflowWrap: 'anywhere' }}
        >
          {label ?? href}
        </a>,
      );
      if (destination === undefined) parts.push(token.slice(href.length));
    } else {
      parts.push(token);
    }
    offset = start + token.length;
  });
  parts.push(text.slice(offset));

  return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{parts}</span>;
}
