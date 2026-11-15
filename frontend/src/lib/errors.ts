import { ApiError, InputError } from '../api/errors';

export type Failure = {
  title: string;
  /** What happened, in plain words. */
  what: string;
  /** What the person can do next. */
  action: string;
  /** The service's own short message, only when it is plain text. Never raw JSON. */
  detail: string | null;
  /** Whether running the same request again can make sense. */
  retryable: boolean;
};

const BY_STATUS: Record<number, { what: string; action: string }> = {
  404: {
    what: 'The service does not know the variable or region you chose.',
    action: 'Pick another variable or region, then try again.',
  },
  409: {
    what: 'The data changed while the analysis was running, so the result no longer matches the dataset version that was asked for.',
    action: 'Try again to use the latest version.',
  },
  413: {
    what: 'The request was too large for the service to accept.',
    action: 'Check the choices and try again. If it keeps happening, tell the project team.',
  },
  422: {
    what: 'The service could not use these choices, for example a period or a point it does not cover.',
    action: 'Check the period and the point, then try again.',
  },
  502: {
    what: 'The data provider did not answer correctly. Nothing was estimated or filled in.',
    action: 'Try again in a moment. If it keeps happening, tell the project team.',
  },
  503: {
    what: 'The data service is not available right now. It may be starting up or not set up yet.',
    action: 'Try again in a moment. If it keeps happening, tell the project team.',
  },
};

const TITLE = 'We could not get the data';

/** Short, human-readable service message, or null when it looks like JSON, markup or is too long. */
export function plainDetail(detail: string): string | null {
  const text = detail.trim();
  if (!text || text.length > 200) return null;
  if (/^[[{<]/.test(text)) return null;
  return text;
}

export function statusOf(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

/** Turns any failure into a title, what happened, what to do, and an optional plain service message. */
export function describeFailure(error: unknown): Failure {
  if (error instanceof InputError) {
    return {
      title: 'Check your choices',
      what: error.message,
      action: 'Adjust the choices and run the analysis again.',
      detail: null,
      retryable: false,
    };
  }

  if (error instanceof ApiError) {
    const known = BY_STATUS[error.status];
    const unexpected = {
      what: `The service answered with an unexpected error (code ${error.status}).`,
      action: 'Try again in a moment. If it keeps happening, tell the project team.',
    };
    return {
      title: TITLE,
      ...(known ?? unexpected),
      detail: plainDetail(error.detail),
      retryable: true,
    };
  }

  if (error instanceof TypeError) {
    return {
      title: TITLE,
      what: 'We could not reach the data service.',
      action: 'Check your connection and try again.',
      detail: null,
      retryable: true,
    };
  }

  return {
    title: TITLE,
    what: 'Something went wrong while getting the data. Nothing was estimated or filled in.',
    action: 'Try again. If it keeps happening, tell the project team.',
    detail: error instanceof Error ? plainDetail(error.message) : null,
    retryable: true,
  };
}
