import * as dotenv from 'dotenv';
import type { Config } from './types/azure-devops.types.js';
import { ConfigurationError } from './utils/errorHandler.js';

dotenv.config();

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ConfigurationError(
      `Required environment variable ${name} is not set. Please check your .env file.`,
      name
    );
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function parseGDPRBlockedTypes(value: string): string[] {
  return value
    .split(',')
    .map(type => type.trim())
    .filter(type => type.length > 0);
}

function parseMaxFileSize(value: string): number {
  const sizeMB = parseFloat(value);
  if (isNaN(sizeMB) || sizeMB <= 0) {
    throw new ConfigurationError(
      `Invalid MAX_FILE_SIZE_MB value: ${value}. Must be a positive number.`
    );
  }
  return sizeMB * 1024 * 1024;
}

export function loadConfig(): Config {
  try {
    const azureDevOpsUrl = getRequiredEnvVar('AZURE_DEVOPS_URL');
    const azureDevOpsPat = getRequiredEnvVar('AZURE_DEVOPS_PAT');
    const azureDevOpsProject = getRequiredEnvVar('AZURE_DEVOPS_PROJECT');

    const gdprBlockedTypesStr = getOptionalEnvVar('GDPR_BLOCKED_WORK_ITEM_TYPES', 'Bug');
    const gdprBlockedWorkItemTypes = parseGDPRBlockedTypes(gdprBlockedTypesStr);

    const maxFileSizeMBStr = getOptionalEnvVar('MAX_FILE_SIZE_MB', '1');
    const maxFileSizeBytes = parseMaxFileSize(maxFileSizeMBStr);

    const config: Config = {
      azureDevOpsUrl: azureDevOpsUrl.replace(/\/$/, ''),
      azureDevOpsPat,
      azureDevOpsProject,
      gdprBlockedWorkItemTypes,
      maxFileSizeBytes,
    };

    console.log('[Config] Configuration loaded successfully');
    console.log(`[Config] Azure DevOps URL: ${config.azureDevOpsUrl}`);
    console.log(`[Config] Project: ${config.azureDevOpsProject}`);
    console.log(`[Config] GDPR Blocked Types: ${config.gdprBlockedWorkItemTypes.join(', ')}`);
    console.log(`[Config] Max File Size: ${(config.maxFileSizeBytes / 1024 / 1024).toFixed(2)} MB`);

    return config;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function validateConfig(config: Config): void {
  if (!config.azureDevOpsUrl.startsWith('http://') && !config.azureDevOpsUrl.startsWith('https://')) {
    throw new ConfigurationError('AZURE_DEVOPS_URL must start with http:// or https://');
  }

  if (config.azureDevOpsPat.length < 20) {
    throw new ConfigurationError('AZURE_DEVOPS_PAT appears to be invalid (too short)');
  }

  if (config.gdprBlockedWorkItemTypes.length === 0) {
    console.warn('[Config] Warning: No GDPR blocked work item types configured');
  }

  if (config.maxFileSizeBytes > 10 * 1024 * 1024) {
    console.warn('[Config] Warning: MAX_FILE_SIZE_MB is very large (>10MB), may cause memory issues');
  }
}
