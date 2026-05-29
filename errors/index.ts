import { tryParseJson } from '../utils/response';
import type { RetryableError } from '../types';

export function extractErrorMessage(error: unknown): string {
  const err = error as RetryableError;
  let message = err.message;
  const body = err.response?.data;

  if (body != null) {
    const parsed = tryParseJson(body);
    if (parsed && typeof parsed === 'object') {
      const b = parsed as {
        error?: { message?: unknown };
        message?: unknown;
        errors?: unknown;
      };
      const joinedErrors = Array.isArray(b.errors)
        ? (b.errors as Array<{ detail?: unknown; title?: unknown }>)
            .map((e) => (typeof e?.detail === 'string' ? e.detail : typeof e?.title === 'string' ? e.title : ''))
            .filter((s) => s.length > 0)
            .join('; ')
        : '';
      const errMsg = typeof b.error?.message === 'string' ? b.error.message : '';
      const plainMsg = typeof b.message === 'string' ? b.message : '';
      message = errMsg || plainMsg || joinedErrors || message;
    } else if (typeof body === 'string') {
      message = 'Server returned a non-JSON response.';
    }
  }

  const status = err.response?.status;
  if (status) {
    message = `[${status}] ${message}`;
  }
  return message;
}
