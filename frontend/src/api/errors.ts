/** An HTTP error returned by the backend. `detail` is the backend message, already reduced to plain text. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  /** The backend's stable error code (for example `request_too_large`), when it sent one. */
  readonly code: string | undefined;

  constructor(status: number, detail: string, message?: string, code?: string) {
    super(message ?? (detail || `Request failed (${status})`));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

/** A problem with the user's choices found before any request was sent. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}
