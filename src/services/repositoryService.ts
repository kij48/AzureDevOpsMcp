import type { FileContent } from '../types/azure-devops.types.js';
import { AzureDevOpsClient } from './azureDevOpsClient.js';
import { FileSizeLimitError, NotFoundError } from '../utils/errorHandler.js';

export class RepositoryService {
  private static resolveRepositoryId(repositoryId: string): string {
    const config = AzureDevOpsClient.getConfig();

    if (repositoryId.includes('/')) {
      return repositoryId;
    }

    if (repositoryId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      return repositoryId;
    }

    return `${config.azureDevOpsProject}/${repositoryId}`;
  }

  static async getFileContent(
    repositoryId: string,
    filePath: string,
    branch: string = 'main'
  ): Promise<FileContent> {
    try {
      const api = await AzureDevOpsClient.getGitApi();
      const config = AzureDevOpsClient.getConfig();
      const resolvedRepoId = this.resolveRepositoryId(repositoryId);

      console.log(`[Repository] Fetching file ${filePath} from ${branch} branch in repository ${resolvedRepoId}...`);

      const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;

      const item = await api.getItem(
        resolvedRepoId,
        normalizedPath,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        undefined,
        {
          versionType: 0,
          version: branch,
        }
      );

      if (!item) {
        throw new NotFoundError('File', filePath);
      }

      const itemSize = (item as any).size;
      if (itemSize && itemSize > config.maxFileSizeBytes) {
        throw new FileSizeLimitError(filePath, itemSize, config.maxFileSizeBytes);
      }

      const itemContent = await api.getItemText(
        resolvedRepoId,
        normalizedPath,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        undefined,
        {
          versionType: 0,
          version: branch,
        }
      );

      const content = await this.readStreamAsString(itemContent);

      return {
        path: filePath,
        content,
        encoding: 'utf-8',
        size: itemSize || content.length,
        repositoryId,
        branch,
      };
    } catch (error) {
      if (error instanceof FileSizeLimitError || error instanceof NotFoundError) {
        throw error;
      }
      console.error(`[Repository] Error fetching file ${filePath}:`, error);
      throw new Error(`Failed to fetch file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async getFileFromPullRequest(
    repositoryId: string,
    pullRequestId: number,
    filePath: string
  ): Promise<FileContent> {
    try {
      const api = await AzureDevOpsClient.getGitApi();
      const config = AzureDevOpsClient.getConfig();
      const resolvedRepoId = this.resolveRepositoryId(repositoryId);

      console.log(`[Repository] Fetching file ${filePath} from PR #${pullRequestId} in ${resolvedRepoId}...`);

      const pr = await api.getPullRequest(resolvedRepoId, pullRequestId, config.azureDevOpsProject);

      if (!pr || !pr.sourceRefName) {
        throw new NotFoundError('Pull request', pullRequestId);
      }

      const sourceBranch = pr.sourceRefName.replace('refs/heads/', '');

      return await this.getFileContent(repositoryId, filePath, sourceBranch);
    } catch (error) {
      if (error instanceof FileSizeLimitError || error instanceof NotFoundError) {
        throw error;
      }
      console.error(`[Repository] Error fetching file from PR #${pullRequestId}:`, error);
      throw new Error(`Failed to fetch file from pull request: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async readStreamAsString(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
}
