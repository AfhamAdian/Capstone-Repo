/**
 * Shared cross-cutting error types (mapped to HTTP status by each controller's
 * catch block). Domain-specific errors that don't cross module boundaries
 * (e.g. SurveyLockedError, CategoryConflictError) stay local to their service
 * file - this file is only for errors reused across multiple services.
 */

export class ForbiddenError extends Error {}
