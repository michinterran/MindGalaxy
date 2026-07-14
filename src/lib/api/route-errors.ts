import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class InvalidJsonRequestError extends Error {
  constructor() {
    super("INVALID_JSON");
    this.name = "InvalidJsonRequestError";
  }
}

export async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidJsonRequestError();
  }
}

export async function parseOptionalJsonRequest(request: Request): Promise<unknown> {
  try {
    const raw = await request.text();
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw new InvalidJsonRequestError();
  }
}

export function invalidJsonResponse(headers?: HeadersInit) {
  return NextResponse.json(
    { error: "INVALID_JSON" },
    { status: 400, headers },
  );
}

export function validationErrorResponse(error: ZodError, headers?: HeadersInit) {
  return NextResponse.json(
    {
      error: "VALIDATION_ERROR",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400, headers },
  );
}
