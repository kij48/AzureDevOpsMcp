import { describe, it, expect } from 'vitest';
import {
  GDPRComplianceError,
  AuthenticationError,
  NotFoundError,
  PermissionError,
  FileSizeLimitError,
  ConfigurationError,
  sanitizeError,
  isRetryableError,
} from '../src/utils/errorHandler.js';

describe('GDPRComplianceError', () => {
  it('should include work item id and type in message', () => {
    const err = new GDPRComplianceError(42, 'Bug');
    expect(err.message).toContain('#42');
    expect(err.message).toContain('"Bug"');
    expect(err.workItemId).toBe(42);
    expect(err.workItemType).toBe('Bug');
    expect(err.name).toBe('GDPRComplianceError');
  });
});

describe('AuthenticationError', () => {
  it('should use default message', () => {
    const err = new AuthenticationError();
    expect(err.message).toContain('Authentication failed');
    expect(err.name).toBe('AuthenticationError');
  });

  it('should accept custom message', () => {
    const err = new AuthenticationError('Token expired');
    expect(err.message).toBe('Token expired');
  });
});

describe('NotFoundError', () => {
  it('should include resource type and id', () => {
    const err = new NotFoundError('Work Item', 123);
    expect(err.message).toContain('Work Item');
    expect(err.message).toContain('123');
    expect(err.resourceType).toBe('Work Item');
    expect(err.resourceId).toBe(123);
  });
});

describe('PermissionError', () => {
  it('should include resource name', () => {
    const err = new PermissionError('project/repo');
    expect(err.message).toContain('project/repo');
    expect(err.resource).toBe('project/repo');
  });
});

describe('FileSizeLimitError', () => {
  it('should include file path and sizes', () => {
    const err = new FileSizeLimitError('big.bin', 2000, 1000);
    expect(err.message).toContain('big.bin');
    expect(err.message).toContain('2000');
    expect(err.message).toContain('1000');
    expect(err.filePath).toBe('big.bin');
    expect(err.fileSize).toBe(2000);
    expect(err.maxSize).toBe(1000);
  });
});

describe('ConfigurationError', () => {
  it('should store missing config key', () => {
    const err = new ConfigurationError('Missing PAT', 'AZURE_PAT');
    expect(err.message).toBe('Missing PAT');
    expect(err.missingConfig).toBe('AZURE_PAT');
  });
});

describe('sanitizeError', () => {
  it('should return message for known error types', () => {
    expect(sanitizeError(new NotFoundError('Item', 1))).toContain('not found');
    expect(sanitizeError(new AuthenticationError())).toContain('Authentication');
    expect(sanitizeError(new PermissionError('repo'))).toContain('permissions');
    expect(sanitizeError(new FileSizeLimitError('f', 2, 1))).toContain('exceeds');
    expect(sanitizeError(new ConfigurationError('bad config'))).toBe('bad config');
    expect(sanitizeError(new GDPRComplianceError(1, 'Bug'))).toContain('GDPR');
  });

  it('should wrap generic Error messages', () => {
    expect(sanitizeError(new Error('oops'))).toBe('An error occurred: oops');
  });

  it('should return fallback for non-Error values', () => {
    expect(sanitizeError('string')).toBe('An unknown error occurred.');
    expect(sanitizeError(null)).toBe('An unknown error occurred.');
  });
});

describe('isRetryableError', () => {
  it.each([
    'timeout',
    'ECONNRESET',
    'ENOTFOUND',
    'network failure',
    'HTTP 503',
    'HTTP 502',
  ])('should return true for retryable message: %s', (msg) => {
    expect(isRetryableError(new Error(msg))).toBe(true);
  });

  it('should return false for non-retryable errors', () => {
    expect(isRetryableError(new Error('not found'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isRetryableError('string')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});
