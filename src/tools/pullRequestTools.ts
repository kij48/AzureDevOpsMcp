import { PullRequestService } from '../services/pullRequestService.js';
import { sanitizeError } from '../utils/errorHandler.js';

export const pullRequestTools = [
  {
    name: 'get_pull_request',
    description:
      'Retrieves detailed information about a pull request, including title, description, source/target branches, status, creator, and dates.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'The repository name (e.g., "MyRepo"), GUID, or full path (e.g., "ProjectName/MyRepo"). Simple names are automatically prefixed with the configured project.',
        },
        pullRequestId: {
          type: 'number',
          description: 'The ID of the pull request',
        },
      },
      required: ['repositoryId', 'pullRequestId'],
    },
  },
  {
    name: 'list_my_pull_requests',
    description:
      'Lists all pull requests created by the current user across all repositories in the project. Useful for finding your own PRs.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'completed', 'abandoned', 'all'],
          description: 'Filter by PR status. Default is "active".',
          default: 'active',
        },
        top: {
          type: 'number',
          description: 'Maximum number of pull requests to return. Default is 100.',
          default: 100,
        },
      },
    },
  },
  {
    name: 'list_pull_requests_assigned_to_me',
    description:
      'Lists all pull requests where the current user is assigned as a reviewer across all repositories in the project. Useful for finding PRs that need your review.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'completed', 'abandoned', 'all'],
          description: 'Filter by PR status. Default is "active".',
          default: 'active',
        },
        top: {
          type: 'number',
          description: 'Maximum number of pull requests to return. Default is 100.',
          default: 100,
        },
      },
    },
  },
  {
    name: 'list_repository_pull_requests',
    description:
      'Lists all pull requests in a specific repository. Can filter by status.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'The repository name (e.g., "MyRepo"), GUID, or full path (e.g., "ProjectName/MyRepo").',
        },
        status: {
          type: 'string',
          enum: ['active', 'completed', 'abandoned', 'all'],
          description: 'Filter by PR status. Default is "active".',
          default: 'active',
        },
        top: {
          type: 'number',
          description: 'Maximum number of pull requests to return. Default is 100.',
          default: 100,
        },
      },
      required: ['repositoryId'],
    },
  },
  {
    name: 'get_pull_request_changes',
    description:
      'Retrieves the list of file changes in a pull request, including the change type (add, edit, delete) and file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'The repository name (e.g., "MyRepo"), GUID, or full path (e.g., "ProjectName/MyRepo"). Simple names are automatically prefixed with the configured project.',
        },
        pullRequestId: {
          type: 'number',
          description: 'The ID of the pull request',
        },
      },
      required: ['repositoryId', 'pullRequestId'],
    },
  },
  {
    name: 'get_pull_request_commits',
    description:
      'Retrieves all commits in a pull request with commit IDs, authors, dates, and commit messages.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'The repository name (e.g., "MyRepo"), GUID, or full path (e.g., "ProjectName/MyRepo"). Simple names are automatically prefixed with the configured project.',
        },
        pullRequestId: {
          type: 'number',
          description: 'The ID of the pull request',
        },
      },
      required: ['repositoryId', 'pullRequestId'],
    },
  },
];

export async function handlePullRequestToolCall(name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case 'get_pull_request': {
        const { repositoryId, pullRequestId } = args;
        const pr = await PullRequestService.getPullRequest(repositoryId, pullRequestId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(pr, null, 2),
            },
          ],
        };
      }

      case 'list_my_pull_requests': {
        const { status = 'active', top = 100 } = args;
        const prs = await PullRequestService.listMyPullRequests(status, top);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(prs, null, 2),
            },
          ],
        };
      }

      case 'list_pull_requests_assigned_to_me': {
        const { status = 'active', top = 100 } = args;
        const prs = await PullRequestService.listPullRequestsAssignedToMe(status, top);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(prs, null, 2),
            },
          ],
        };
      }

      case 'list_repository_pull_requests': {
        const { repositoryId, status = 'active', top = 100 } = args;
        const prs = await PullRequestService.listPullRequests(repositoryId, status, undefined, undefined, top);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(prs, null, 2),
            },
          ],
        };
      }

      case 'get_pull_request_changes': {
        const { repositoryId, pullRequestId } = args;
        const changes = await PullRequestService.getPullRequestChanges(repositoryId, pullRequestId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(changes, null, 2),
            },
          ],
        };
      }

      case 'get_pull_request_commits': {
        const { repositoryId, pullRequestId } = args;
        const commits = await PullRequestService.getPullRequestCommits(repositoryId, pullRequestId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(commits, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown pull request tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${sanitizeError(error)}`,
        },
      ],
      isError: true,
    };
  }
}
