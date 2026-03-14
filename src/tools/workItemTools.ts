import { WorkItemService } from '../services/workItemService.js';
import { sanitizeError } from '../utils/errorHandler.js';

export const workItemTools = [
  {
    name: 'get_my_work_items',
    description:
      'Retrieves work items assigned to the current user with status "New" or "In Progress". Returns work items ordered by most recently changed. GDPR-blocked work item types (e.g., Bug) are included with safe metadata only (title, team, status, tags); sensitive content is redacted. Default limit is 200 items.',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of work items to return (default: 200, max: 1000)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_work_item',
    description:
      'Retrieves detailed information about an Azure DevOps work item by ID, including title, description, state, assignee, dates, all custom fields, discussion comments, child item summary, and attachment metadata. GDPR-blocked types (e.g., Bug) return safe metadata only (title, team, status, tags) with sensitive content redacted.',
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
  {
    name: 'get_weekly_work_report',
    description:
      'Generates a weekly work report for the current user, showing all work items changed in the specified number of days (default: 7). For each work item, returns: ID, title, type, state, number of commits, and time registration value (Schultz.TimeRegistration field). GDPR-blocked items are included with safe metadata (title, status) but no commits or time registration. Perfect for management reporting.',
    inputSchema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default: 7)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_work_item_attachment',
    description:
      'Downloads an attachment from an Azure DevOps work item by URL and returns its content. For images, returns an MCP image content block so Claude can view it. Attachment URLs can be found in work item attachment metadata or extracted from inline images in comments/descriptions (e.g. _apis/wit/attachments/{guid} URLs).',
    inputSchema: {
      type: 'object',
      properties: {
        attachmentUrl: {
          type: 'string',
          description: 'The full URL of the attachment to download (must be on the configured Azure DevOps host)',
        },
      },
      required: ['attachmentUrl'],
    },
  },
];

export async function handleWorkItemToolCall(name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case 'get_my_work_items': {
        const { maxResults } = args;
        // Cap maxResults at 1000 to prevent overwhelming the system
        const limitedMaxResults = maxResults ? Math.min(maxResults, 1000) : 200;
        const workItems = await WorkItemService.getMyWorkItems(limitedMaxResults);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(workItems, null, 2),
            },
          ],
        };
      }

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

      case 'get_weekly_work_report': {
        const { days = 7 } = args;
        const report = await WorkItemService.getWeeklyWorkReport(days);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(report, null, 2),
            },
          ],
        };
      }

      case 'get_work_item_attachment': {
        const { attachmentUrl } = args;
        const attachment = await WorkItemService.downloadAttachment(attachmentUrl);

        if (attachment.mimeType.startsWith('image/')) {
          return {
            content: [
              {
                type: 'text',
                text: `Attachment: ${attachment.name} (${attachment.size} bytes, ${attachment.mimeType})`,
              },
              {
                type: 'image',
                data: attachment.data,
                mimeType: attachment.mimeType,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Attachment: ${attachment.name} (${attachment.size} bytes, ${attachment.mimeType})\n\nBase64 content:\n${attachment.data}`,
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
