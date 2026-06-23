export type SlamErrorKind = "validation" | "unauthorized" | "forbidden" | "not_found" | "internal";

const STATUS_BY_KIND: Record<SlamErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  internal: 500
};

/**
 * Domain error carrying an HTTP-ish status so transports can map failures to
 * the right response code instead of collapsing everything to 400.
 */
export class SlamError extends Error {
  readonly kind: SlamErrorKind;
  readonly status: number;

  constructor(kind: SlamErrorKind, message: string) {
    super(message);
    this.name = "SlamError";
    this.kind = kind;
    this.status = STATUS_BY_KIND[kind];
  }
}

export function statusForError(error: unknown): number {
  return error instanceof SlamError ? error.status : 400;
}
