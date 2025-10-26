import type { PullRequestDetails, CommitDetails, FileChangeDetails } from '../types/azure-devops.types.js';
import { AzureDevOpsClient } from './azureDevOpsClient.js';
import { NotFoundError } from '../utils/errorHandler.js';

export class PullRequestService {
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

  static async getPullRequest(repositoryId: string, pullRequestId: number): Promise<PullRequestDetails> {
    try {
      const api = await AzureDevOpsClient.getGitApi();
      const config = AzureDevOpsClient.getConfig();
      const resolvedRepoId = this.resolveRepositoryId(repositoryId);

      console.log(`[PullRequest] Fetching PR #${pullRequestId} from repository ${resolvedRepoId} in project ${config.azureDevOpsProject}...`);
      console.log(`[PullRequest] Original repository ID input: "${repositoryId}"`);
      console.log(`[PullRequest] Resolved repository ID: "${resolvedRepoId}"`);
      console.log(`[PullRequest] Project: "${config.azureDevOpsProject}"`);

      // Try different repository ID formats
      let pr = null;
      let lastError = null;

      // Attempt 1: Just the repository name
      const repoNameOnly = repositoryId.includes('/') ? repositoryId.split('/')[1] : repositoryId;
      console.log(`[PullRequest] Attempt 1: Using repository name: "${repoNameOnly}"`);
      try {
        pr = await api.getPullRequest(repoNameOnly, pullRequestId, config.azureDevOpsProject);
        if (pr) console.log(`[PullRequest] Success with repository name "${repoNameOnly}"`);
      } catch (err) {
        lastError = err;
        console.log(`[PullRequest] Attempt 1 failed:`, err instanceof Error ? err.message : err);
      }

      // Attempt 2: Full path if first attempt failed
      if (!pr && resolvedRepoId !== repoNameOnly) {
        console.log(`[PullRequest] Attempt 2: Using full path: "${resolvedRepoId}"`);
        try {
          pr = await api.getPullRequest(resolvedRepoId, pullRequestId, config.azureDevOpsProject);
          if (pr) console.log(`[PullRequest] Success with full path "${resolvedRepoId}"`);
        } catch (err) {
          lastError = err;
          console.log(`[PullRequest] Attempt 2 failed:`, err instanceof Error ? err.message : err);
        }
      }

      // Attempt 3: Try without project parameter
      if (!pr) {
        console.log(`[PullRequest] Attempt 3: Using repository name without project parameter`);
        try {
          pr = await api.getPullRequest(repoNameOnly, pullRequestId);
          if (pr) console.log(`[PullRequest] Success without project parameter`);
        } catch (err) {
          lastError = err;
          console.log(`[PullRequest] Attempt 3 failed:`, err instanceof Error ? err.message : err);
        }
      }

      if (!pr) {
        console.error(`[PullRequest] All attempts failed for PR #${pullRequestId}`);
        console.error(`[PullRequest] Last error:`, lastError);
        throw new NotFoundError('Pull request', pullRequestId);
      }

      console.log(`[PullRequest] Successfully retrieved PR #${pullRequestId}: "${pr.title}"`);

      return {
        pullRequestId: pr.pullRequestId!,
        title: pr.title || '',
        description: pr.description || '',
        sourceRefName: pr.sourceRefName || '',
        targetRefName: pr.targetRefName || '',
        status: pr.status?.toString() || '',
        createdBy: pr.createdBy?.displayName || 'Unknown',
        creationDate: pr.creationDate || new Date(),
        closedDate: pr.closedDate,
        repositoryId,
        url: pr.url,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      console.error(`[PullRequest] Error fetching PR #${pullRequestId}:`, error);
      throw new Error(`Failed to fetch pull request #${pullRequestId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async getPullRequestChanges(repositoryId: string, pullRequestId: number): Promise<FileChangeDetails[]> {
    try {
      const api = await AzureDevOpsClient.getGitApi();
      const config = AzureDevOpsClient.getConfig();
      const repoNameOnly = repositoryId.includes('/') ? repositoryId.split('/')[1] : repositoryId;

      console.log(`[PullRequest] Fetching changes for PR #${pullRequestId} from ${repoNameOnly} in project ${config.azureDevOpsProject}...`);

      const iteration = await api.getPullRequestIterationChanges(
        repoNameOnly,
        pullRequestId,
        1
      );

      if (!iteration || !iteration.changeEntries) {
        return [];
      }

      const changes: FileChangeDetails[] = iteration.changeEntries.map(change => ({
        changeType: change.changeType?.toString() || 'Unknown',
        path: change.item?.path || '',
        url: change.item?.url,
      }));

      return changes;
    } catch (error) {
      console.error(`[PullRequest] Error fetching changes for PR #${pullRequestId}:`, error);
      throw new Error(`Failed to fetch pull request changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async getPullRequestCommits(repositoryId: string, pullRequestId: number): Promise<CommitDetails[]> {
    try {
      const api = await AzureDevOpsClient.getGitApi();
      const config = AzureDevOpsClient.getConfig();
      const repoNameOnly = repositoryId.includes('/') ? repositoryId.split('/')[1] : repositoryId;

      console.log(`[PullRequest] Fetching commits for PR #${pullRequestId} from ${repoNameOnly} in project ${config.azureDevOpsProject}...`);

      const commits = await api.getPullRequestCommits(repoNameOnly, pullRequestId, config.azureDevOpsProject);

      if (!commits) {
        return [];
      }

      return commits.map(commit => ({
        commitId: commit.commitId || '',
        author: commit.author?.name || 'Unknown',
        authorEmail: commit.author?.email || '',
        date: commit.author?.date || new Date(),
        comment: commit.comment || '',
        repositoryId,
        url: commit.remoteUrl,
      }));
    } catch (error) {
      console.error(`[PullRequest] Error fetching commits for PR #${pullRequestId}:`, error);
      return [];
    }
  }

  static async listPullRequests(
    repositoryId?: string,
    status: 'active' | 'completed' | 'abandoned' | 'all' = 'active',
    creatorId?: string,
    reviewerId?: string,
    top: number = 100
  ): Promise<PullRequestDetails[]> {
    try {
      const api = await AzureDevOpsClient.getGitApi();
      const config = AzureDevOpsClient.getConfig();

      let repoNameOnly: string | undefined;
      if (repositoryId) {
        repoNameOnly = repositoryId.includes('/') ? repositoryId.split('/')[1] : repositoryId;
        console.log(`[PullRequest] Listing pull requests in repository ${repoNameOnly} with status: ${status}...`);
      } else {
        console.log(`[PullRequest] Listing pull requests across all repositories in project with status: ${status}...`);
      }

      const searchCriteria: any = {
        status: status === 'all' ? undefined : status,
        creatorId: creatorId,
        reviewerId: reviewerId,
        top: top,
      };

      const prs = repositoryId
        ? await api.getPullRequests(repoNameOnly!, searchCriteria, config.azureDevOpsProject)
        : await api.getPullRequestsByProject(config.azureDevOpsProject, searchCriteria);

      if (!prs || prs.length === 0) {
        console.log(`[PullRequest] No pull requests found`);
        return [];
      }

      console.log(`[PullRequest] Found ${prs.length} pull requests`);

      return prs.map(pr => ({
        pullRequestId: pr.pullRequestId!,
        title: pr.title || '',
        description: pr.description || '',
        sourceRefName: pr.sourceRefName || '',
        targetRefName: pr.targetRefName || '',
        status: pr.status?.toString() || '',
        createdBy: pr.createdBy?.displayName || 'Unknown',
        creationDate: pr.creationDate || new Date(),
        closedDate: pr.closedDate,
        repositoryId: pr.repository?.name || repositoryId || '',
        url: pr.url,
      }));
    } catch (error) {
      console.error(`[PullRequest] Error listing pull requests:`, error);
      throw new Error(`Failed to list pull requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async listMyPullRequests(
    status: 'active' | 'completed' | 'abandoned' | 'all' = 'active',
    top: number = 100
  ): Promise<PullRequestDetails[]> {
    try {
      console.log(`[PullRequest] Listing my pull requests with status: ${status}...`);

      // Get current user identity using the connection's authorized resource
      const connection = AzureDevOpsClient.getConnection();
      const locationApi = await connection.getLocationsApi();
      const connectionData = await locationApi.getConnectionData();
      const myId = connectionData?.authenticatedUser?.id;

      if (!myId) {
        throw new Error('Unable to determine current user ID');
      }

      console.log(`[PullRequest] Current user ID: ${myId}`);

      return await this.listPullRequests(undefined, status, myId, undefined, top);
    } catch (error) {
      console.error(`[PullRequest] Error listing my pull requests:`, error);
      throw new Error(`Failed to list my pull requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async listPullRequestsAssignedToMe(
    status: 'active' | 'completed' | 'abandoned' | 'all' = 'active',
    top: number = 100
  ): Promise<PullRequestDetails[]> {
    try {
      console.log(`[PullRequest] Listing pull requests assigned to me with status: ${status}...`);

      // Get current user identity using the connection's authorized resource
      const connection = AzureDevOpsClient.getConnection();
      const locationApi = await connection.getLocationsApi();
      const connectionData = await locationApi.getConnectionData();
      const myId = connectionData?.authenticatedUser?.id;

      if (!myId) {
        throw new Error('Unable to determine current user ID');
      }

      console.log(`[PullRequest] Current user ID: ${myId}`);

      return await this.listPullRequests(undefined, status, undefined, myId, top);
    } catch (error) {
      console.error(`[PullRequest] Error listing pull requests assigned to me:`, error);
      throw new Error(`Failed to list pull requests assigned to me: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
