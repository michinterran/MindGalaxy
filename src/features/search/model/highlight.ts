export type HighlightSegment = {
  highlighted: boolean;
  text: string;
};

function normalizeTokens(tokens: string[]) {
  return Array.from(
    new Set(
      tokens
        .flatMap((token) => token.split(/\s+/g))
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  ).sort((left, right) => right.length - left.length);
}

export function splitHighlightSegments(
  text: string,
  tokens: string[],
): HighlightSegment[] {
  const normalized = normalizeTokens(tokens);

  if (!text || !normalized.length) {
    return [{ highlighted: false, text }];
  }

  const lowerText = text.toLocaleLowerCase();
  const matches: Array<{ start: number; end: number }> = [];

  for (const token of normalized) {
    const lowerToken = token.toLocaleLowerCase();
    let start = lowerText.indexOf(lowerToken);

    while (start >= 0) {
      const end = start + lowerToken.length;
      const overlaps = matches.some(
        (match) => start < match.end && end > match.start,
      );

      if (!overlaps) {
        matches.push({ start, end });
      }

      start = lowerText.indexOf(lowerToken, end);
    }
  }

  if (!matches.length) {
    return [{ highlighted: false, text }];
  }

  matches.sort((left, right) => left.start - right.start);

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ highlighted: false, text: text.slice(cursor, match.start) });
    }

    segments.push({ highlighted: true, text: text.slice(match.start, match.end) });
    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({ highlighted: false, text: text.slice(cursor) });
  }

  return segments;
}
