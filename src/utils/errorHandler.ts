export class GDPRComplianceError extends Error {
  public readonly workItemId: number;
  public readonly workItemType: string;

  constructor(workItemId: number, workItemType: string) {
    super(
      `Access to work item #${workItemId} of type "${workItemType}" is blocked by GDPR policy. ` +
      `This work item type may contain personal data and cannot be accessed through this API.`
    );
    this.name = 'GDPRComplianceError';
    this.workItemId = workItemId;
    this.workItemType = workItemType;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication failed. Please check your PAT and permissions.') {
    super(message);
    this.name = 'AuthenticationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends Error {
  public readonly resourceType: string;
  public readonly resourceId: string | number;

  constructor(resourceType: string, resourceId: string | number) {
    super(`${resourceType} with ID ${resourceId} not found.`);
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class PermissionError extends Error {
  public readonly resource: string;

  constructor(resource: string) {
    super(`Insufficient permissions to access ${resource}.`);
    this.name = 'PermissionError';
    this.resource = resource;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class FileSizeLimitError extends Error {
  public readonly filePath: string;
  public readonly fileSize: number;
  public readonly maxSize: number;

  constructor(filePath: string, fileSize: number, maxSize: number) {
    super(
      `File "${filePath}" size (${fileSize} bytes) exceeds the maximum allowed size (${maxSize} bytes). ` +
      `Please use a Git client to retrieve large files.`
    );
    this.name = 'FileSizeLimitError';
    this.filePath = filePath;
    this.fileSize = fileSize;
    this.maxSize = maxSize;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends Error {
  public readonly missingConfig?: string;

  constructor(message: string, missingConfig?: string) {
    super(message);
    this.name = 'ConfigurationError';
    this.missingConfig = missingConfig;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function sanitizeError(error: unknown): string {
  if (error instanceof GDPRComplianceError) {
    return error.message;
  }

  if (error instanceof AuthenticationError) {
    return error.message;
  }

  if (error instanceof NotFoundError) {
    return error.message;
  }

  if (error instanceof PermissionError) {
    return error.message;
  }

  if (error instanceof FileSizeLimitError) {
    return error.message;
  }

  if (error instanceof ConfigurationError) {
    return error.message;
  }

  if (error instanceof Error) {
    return `An error occurred: ${error.message}`;
  }

  return 'An unknown error occurred.';
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('network') ||
      message.includes('503') ||
      message.includes('502')
    );
  }
  return false;
}
