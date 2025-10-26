import { WorkItemService } from '../services/workItemService.js';
import { sanitizeError } from '../utils/errorHandler.js';

export const workItemTools = [
  {
    name: 'get_work_item',
    description:
      'Retrieves detailed information about an Azure DevOps work item by ID, including title, description, state, assignee, dates, and all custom fields. Note: Bug work items are blocked by GDPR policy.',
    inputSchema: {
      type: 'object',
      properties: {
        workItemId: {
          type: 'number',
          description: 'The ID of the work item to retrieve',
        },
      },
      required: ['workItemId'],
    },
  },
  {
    name: 'get_work_item_children',
    description:
      'Retrieves all child work items for a given parent work item ID. Recursively fetches children up to a maximum depth of 5 levels.',
    inputSchema: {
      type: 'object',
      properties: {
        workItemId: {
          type: 'number',
          description: 'The ID of the parent work item',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth for recursive child fetching (default: 5)',
        },
      },
      required: ['workItemId'],
    },
  },
  {
    name: 'get_work_item_commits',
    description:
      'Retrieves all commits associated with a work item, including both directly linked commits and commits from associated pull requests. Returns a deduplicated list sorted by date (newest first).',
    inputSchema: {
      type: 'object',
      properties: {
        workItemId: {
          type: 'number',
          description: 'The ID of the work item',
        },
      },
      required: ['workItemId'],
    },
  },
  {
    name: 'get_work_item_tree',
    description:
      'Retrieves the complete hierarchical tree structure for a work item, including the root item and all descendants organized in a tree format with depth information.',
    inputSchema: {
      type: 'object',
      properties: {
        workItemId: {
          type: 'number',
          description: 'The ID of the root work item',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth for the tree (default: 5)',
        },
      },
      required: ['workItemId'],
    },
  },
];

export async function handleWorkItemToolCall(name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case 'get_work_item': {
        const { workItemId } = args;
        const workItem = await WorkItemService.getWorkItem(workItemId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(workItem, null, 2),
            },
          ],
        };
      }

      case 'get_work_item_children': {
        const { workItemId, maxDepth = 5 } = args;
        const children = await WorkItemService.getChildWorkItems(workItemId, maxDepth);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(children, null, 2),
            },
          ],
        };
      }

      case 'get_work_item_commits': {
        const { workItemId } = args;
        const commits = await WorkItemService.getAllCommits(workItemId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(commits, null, 2),
            },
          ],
        };
      }

      case 'get_work_item_tree': {
        const { workItemId, maxDepth = 5 } = args;
        const tree = await WorkItemService.getWorkItemTree(workItemId, maxDepth);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(tree, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown work item tool: ${name}`);
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
