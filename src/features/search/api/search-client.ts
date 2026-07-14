import {
  searchResponseSchema,
  type SearchRequest,
  type SearchResponse,
} from "@/features/search/model/schemas";

export async function searchKnowledge(
  request: SearchRequest,
  options: { signal?: AbortSignal } = {},
): Promise<SearchResponse> {
  const response = await fetch("/api/search", {
    body: JSON.stringify(request),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error("SEARCH_REQUEST_FAILED");
  }

  return searchResponseSchema.parse(await response.json());
}

export function isAbortError(error: unknown) {
  if (error instanceof DOMException || error instanceof Error) {
    return error.name === "AbortError";
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

export function isLatestSearchRequest(current: number, latest: number) {
  return current === latest;
}
