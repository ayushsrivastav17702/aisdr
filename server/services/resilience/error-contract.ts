export interface ApiError {
  code: string;
  message: string;
  action: string;
  statusCode: number;
  details?: Record<string, unknown>;
  correlationId?: string;
}

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  AUTHORIZATION_DENIED: "AUTHORIZATION_DENIED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  DATABASE_ERROR: "DATABASE_ERROR",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  AI_SERVICE_ERROR: "AI_SERVICE_ERROR",
  AI_SERVICE_UNAVAILABLE: "AI_SERVICE_UNAVAILABLE",
  EMAIL_SERVICE_ERROR: "EMAIL_SERVICE_ERROR",
  EMAIL_SERVICE_UNAVAILABLE: "EMAIL_SERVICE_UNAVAILABLE",
  QUEUE_ERROR: "QUEUE_ERROR",
  QUEUE_UNAVAILABLE: "QUEUE_UNAVAILABLE",
  SERVICE_DEGRADED: "SERVICE_DEGRADED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  CONFLICT: "CONFLICT",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const ErrorMessages: Record<ErrorCode, { message: string; action: string; statusCode: number }> = {
  [ErrorCodes.VALIDATION_ERROR]: {
    message: "The information provided is invalid.",
    action: "Please check the highlighted fields and try again.",
    statusCode: 400,
  },
  [ErrorCodes.AUTHENTICATION_REQUIRED]: {
    message: "Please sign in to continue.",
    action: "Click the sign in button to authenticate.",
    statusCode: 401,
  },
  [ErrorCodes.AUTHORIZATION_DENIED]: {
    message: "You don't have permission to perform this action.",
    action: "Contact your administrator if you need access.",
    statusCode: 403,
  },
  [ErrorCodes.RESOURCE_NOT_FOUND]: {
    message: "The requested item could not be found.",
    action: "The item may have been deleted or moved.",
    statusCode: 404,
  },
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: {
    message: "Too many requests. Please slow down.",
    action: "Wait a moment and try again.",
    statusCode: 429,
  },
  [ErrorCodes.DATABASE_ERROR]: {
    message: "A database error occurred.",
    action: "Your changes have been queued and will be saved automatically.",
    statusCode: 500,
  },
  [ErrorCodes.DATABASE_UNAVAILABLE]: {
    message: "Temporary database issue.",
    action: "Your action has been queued and will auto-retry.",
    statusCode: 503,
  },
  [ErrorCodes.AI_SERVICE_ERROR]: {
    message: "AI generation encountered an issue.",
    action: "Using safe fallback copy. You can edit manually if needed.",
    statusCode: 500,
  },
  [ErrorCodes.AI_SERVICE_UNAVAILABLE]: {
    message: "AI service is temporarily unavailable.",
    action: "Using approved fallback templates. Full AI features will resume shortly.",
    statusCode: 503,
  },
  [ErrorCodes.EMAIL_SERVICE_ERROR]: {
    message: "Email sending encountered an issue.",
    action: "Email has been queued and will be sent when service recovers.",
    statusCode: 500,
  },
  [ErrorCodes.EMAIL_SERVICE_UNAVAILABLE]: {
    message: "Email service is temporarily unavailable.",
    action: "Your emails are queued and will be sent automatically when service resumes.",
    statusCode: 503,
  },
  [ErrorCodes.QUEUE_ERROR]: {
    message: "Background processing encountered an issue.",
    action: "Your task has been saved and will be processed shortly.",
    statusCode: 500,
  },
  [ErrorCodes.QUEUE_UNAVAILABLE]: {
    message: "Automation is temporarily paused.",
    action: "Tasks are being queued and will resume automatically.",
    statusCode: 503,
  },
  [ErrorCodes.SERVICE_DEGRADED]: {
    message: "Some features are running in limited mode.",
    action: "Core functionality is available. Full features will resume shortly.",
    statusCode: 503,
  },
  [ErrorCodes.INTERNAL_ERROR]: {
    message: "An unexpected error occurred.",
    action: "Please try again. If the problem persists, contact support.",
    statusCode: 500,
  },
  [ErrorCodes.REQUEST_TIMEOUT]: {
    message: "The request took too long to complete.",
    action: "Please try again. The operation may have been queued.",
    statusCode: 504,
  },
  [ErrorCodes.CONFLICT]: {
    message: "A conflict occurred with existing data.",
    action: "Refresh the page and try your changes again.",
    statusCode: 409,
  },
};

export function createApiError(
  code: ErrorCode,
  overrides?: Partial<Omit<ApiError, "code">>,
  correlationId?: string
): ApiError {
  const defaults = ErrorMessages[code];
  return {
    code,
    message: overrides?.message ?? defaults.message,
    action: overrides?.action ?? defaults.action,
    statusCode: overrides?.statusCode ?? defaults.statusCode,
    details: overrides?.details,
    correlationId,
  };
}

export function createValidationError(
  fieldErrors: Record<string, string>,
  correlationId?: string
): ApiError {
  return createApiError(
    ErrorCodes.VALIDATION_ERROR,
    {
      message: "Please fix the following issues:",
      details: { fieldErrors },
    },
    correlationId
  );
}

export function isApiError(obj: unknown): obj is ApiError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "code" in obj &&
    "message" in obj &&
    "action" in obj &&
    "statusCode" in obj
  );
}

export class AppError extends Error {
  public readonly apiError: ApiError;

  constructor(code: ErrorCode, overrides?: Partial<Omit<ApiError, "code">>, correlationId?: string) {
    const apiError = createApiError(code, overrides, correlationId);
    super(apiError.message);
    this.apiError = apiError;
    this.name = "AppError";
  }

  toJSON(): ApiError {
    return this.apiError;
  }
}

export function toApiErrorResponse(error: unknown, correlationId?: string): ApiError {
  if (error instanceof AppError) {
    return error.apiError;
  }

  if (isApiError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : "An unexpected error occurred";

  return createApiError(
    ErrorCodes.INTERNAL_ERROR,
    { message, action: "Please try again or contact support." },
    correlationId
  );
}
