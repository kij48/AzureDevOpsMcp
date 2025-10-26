import { RepositoryService } from '../services/repositoryService.js';
import { sanitizeError } from '../utils/errorHandler.js';

export const fileTools = [
  {
    name: 'get_file_content',
    description:
      'Retrieves the content of a file from a repository. By default, fetches from the main branch, but you can specify a different branch. File size is limited by configuration (default 1MB).',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryId: {
          type: 'string',
          description: 'The repository name (e.g., "MyRepo"), GUID, or full path (e.g., "ProjectName/MyRepo"). Simple names are automatically prefixed with the configured project.',
        },
        filePath: {
          type: 'string',
          description: 'The path to the file in the repository (e.g., /src/index.ts)',
        },
        branch: {
          type: 'string',
          description: 'The branch name (default: main)',
        },
      },
      required: ['repositoryId', 'filePath'],
    },
  },
  {
    name: 'get_file_from_pr',
    description:
      'Retrieves the content of a file from a pull request source branch. This allows you to see the file content as it exists in the PR.',
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
        filePath: {
          type: 'string',
          description: 'The path to the file in the repository',
        },
      },
      required: ['repositoryId', 'pullRequestId', 'filePath'],
    },
  },
];

export async function handleFileToolCall(name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case 'get_file_content': {
        const { repositoryId, filePath, branch = 'main' } = args;
        const fileContent = await RepositoryService.getFileContent(repositoryId, filePath, branch);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(fileContent, null, 2),
            },
          ],
        };
      }

      case 'get_file_from_pr': {
        const { repositoryId, pullRequestId, filePath } = args;
        const fileContent = await RepositoryService.getFileFromPullRequest(
          repositoryId,
          pullRequestId,
          filePath
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(fileContent, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown file tool: ${name}`);
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
