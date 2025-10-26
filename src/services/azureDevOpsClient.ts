import * as azdev from 'azure-devops-node-api';
import type { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi.js';
import type { IGitApi } from 'azure-devops-node-api/GitApi.js';
import type { Config } from '../types/azure-devops.types.js';
import { AuthenticationError } from '../utils/errorHandler.js';

export class AzureDevOpsClient {
  private static connection: azdev.WebApi | null = null;
  private static config: Config | null = null;
  private static workItemApi: IWorkItemTrackingApi | null = null;
  private static gitApi: IGitApi | null = null;

  static async initialize(config: Config): Promise<void> {
    try {
      console.log('[AzureDevOps] Initializing connection...');

      const authHandler = azdev.getPersonalAccessTokenHandler(config.azureDevOpsPat);
      this.connection = new azdev.WebApi(config.azureDevOpsUrl, authHandler);
      this.config = config;

      await this.validateConnection();

      console.log('[AzureDevOps] Connection initialized successfully');
    } catch (error) {
      console.error('[AzureDevOps] Failed to initialize connection:', error);
      throw new AuthenticationError(
        `Failed to connect to Azure DevOps: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async getWorkItemTrackingApi(): Promise<IWorkItemTrackingApi> {
    if (!this.connection) {
      throw new Error('Azure DevOps client not initialized. Call initialize() first.');
    }

    if (!this.workItemApi) {
      try {
        this.workItemApi = await this.connection.getWorkItemTrackingApi();
        console.log('[AzureDevOps] Work Item Tracking API initialized');
      } catch (error) {
        throw new AuthenticationError(
          `Failed to get Work Item Tracking API: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return this.workItemApi;
  }

  static async getGitApi(): Promise<IGitApi> {
    if (!this.connection) {
      throw new Error('Azure DevOps client not initialized. Call initialize() first.');
    }

    if (!this.gitApi) {
      try {
        this.gitApi = await this.connection.getGitApi();
        console.log('[AzureDevOps] Git API initialized');
      } catch (error) {
        throw new AuthenticationError(
          `Failed to get Git API: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return this.gitApi;
  }

  static async validateConnection(): Promise<boolean> {
    if (!this.connection) {
      throw new Error('Azure DevOps client not initialized. Call initialize() first.');
    }

    try {
      console.log('[AzureDevOps] Validating connection...');
      const witApi = await this.getWorkItemTrackingApi();

      await witApi.getWorkItemTypes(this.config!.azureDevOpsProject);

      console.log('[AzureDevOps] Connection validation successful');
      return true;
    } catch (error) {
      console.error('[AzureDevOps] Connection validation failed:', error);
      throw new AuthenticationError(
        `Connection validation failed. Please check your PAT, organization, and project settings. Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static getConfig(): Config {
    if (!this.config) {
      throw new Error('Azure DevOps client not initialized. Call initialize() first.');
    }
    return this.config;
  }

  static isInitialized(): boolean {
    return this.connection !== null && this.config !== null;
  }

  static getConnection(): azdev.WebApi {
    if (!this.connection) {
      throw new Error('Azure DevOps client not initialized. Call initialize() first.');
    }
    return this.connection;
  }
}
