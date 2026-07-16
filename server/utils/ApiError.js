export class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new ApiError(400, message, code, details);
  }
  static unauthorized(message = 'Not authenticated.', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }
  static forbidden(message = 'You do not have permission to perform this action.', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }
  static notFound(message = 'Resource not found.', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }
  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, message, code);
  }
  static tooMany(message = 'Too many requests. Please try again later.', code = 'RATE_LIMITED') {
    return new ApiError(429, message, code);
  }
  static internal(message = 'Something went wrong.', code = 'INTERNAL_ERROR') {
    return new ApiError(500, message, code);
  }
  static serviceUnavailable(message, code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(503, message, code);
  }
}
