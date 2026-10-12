export class ServiceError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    this.status = status; this.code = code; this.retryAfter = retryAfter;
  }
}
