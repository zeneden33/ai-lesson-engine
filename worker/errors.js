export class AppError extends Error {
  constructor(code, message, status = 400, details = null, retryable = false) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryable = retryable;
  }

  toResponse(headers = {}) {
    const body = {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
        ...(this.retryable && { retryable: true })
      }
    };

    const responseHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    if (this.code === 'RATE_LIMITED' && this.details?.retryAfter) {
      responseHeaders['Retry-After'] = String(this.details.retryAfter);
    }

    return new Response(JSON.stringify(body), {
      status: this.status,
      headers: responseHeaders
    });
  }
}

export class ValidationError extends AppError {
  constructor(message, details = null) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter) {
    const minutes = Math.ceil(retryAfter / 60);
    super(
      'RATE_LIMITED',
      `Too many requests. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      429,
      { retryAfter }
    );
    this.name = 'RateLimitError';
  }
}

export class AIError extends AppError {
  constructor(message = 'AI service temporarily unavailable') {
    super('AI_ERROR', message, 502, null, true);
    this.name = 'AIError';
  }
}

export class AIResponseError extends AppError {
  constructor(details) {
    super('AI_RESPONSE_ERROR', 'AI generated invalid lesson data', 422, details);
    this.name = 'AIResponseError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', `${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export function successResponse(data, meta = {}) {
  return new Response(JSON.stringify({
    success: true,
    data,
    meta
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleError(err) {
  if (err instanceof AppError) {
    return err.toResponse();
  }

  console.error('Unhandled error:', err);

  return new Response(JSON.stringify({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    }
  }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
