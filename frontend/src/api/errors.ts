/** An HTTP error returned by the backend. `detail` is the backend message, already reduced to plain text. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string, message?: string) {
    super(message ?? (detail || `Request failed (${status})`));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** A problem with the user's choices found before any request was sent. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}
