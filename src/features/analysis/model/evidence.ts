export type VerifiedEvidence = {
  quote: string;
  startOffset: number | null;
  endOffset: number | null;
  verified: boolean;
};

function normalizeWithMap(input: string) {
  let normalized = "";
  const indexMap: number[] = [];
  let previousWasSpace = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const isSpace = /\s/.test(char);

    if (isSpace) {
      if (!previousWasSpace) {
        normalized += " ";
        indexMap.push(index);
      }
      previousWasSpace = true;
    } else {
      normalized += char;
      indexMap.push(index);
      previousWasSpace = false;
    }
  }

  let start = 0;
  let end = normalized.length;

  while (start < end && normalized[start] === " ") {
    start += 1;
  }

  while (end > start && normalized[end - 1] === " ") {
    end -= 1;
  }

  return {
    normalized: normalized.slice(start, end),
    indexMap: indexMap.slice(start, end),
  };
}

export function verifyEvidenceQuote(
  rawText: string,
  quote?: string | null,
): VerifiedEvidence | null {
  const trimmedQuote = quote?.trim();

  if (!trimmedQuote) return null;

  const exactIndex = rawText.indexOf(trimmedQuote);

  if (exactIndex >= 0) {
    return {
      quote: trimmedQuote,
      startOffset: exactIndex,
      endOffset: exactIndex + trimmedQuote.length,
      verified: true,
    };
  }

  const raw = normalizeWithMap(rawText);
  const target = normalizeWithMap(trimmedQuote);
  const normalizedIndex = raw.normalized.indexOf(target.normalized);

  if (normalizedIndex >= 0) {
    const startOffset = raw.indexMap[normalizedIndex] ?? null;
    const endMapIndex = normalizedIndex + target.normalized.length - 1;
    const endOffset =
      raw.indexMap[endMapIndex] !== undefined ? raw.indexMap[endMapIndex] + 1 : null;

    return {
      quote: trimmedQuote,
      startOffset,
      endOffset,
      verified: startOffset !== null && endOffset !== null,
    };
  }

  return {
    quote: trimmedQuote,
    startOffset: null,
    endOffset: null,
    verified: false,
  };
}
