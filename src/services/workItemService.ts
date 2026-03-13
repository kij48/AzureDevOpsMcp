import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import type { WorkItemDetails, WorkItemTree, CommitDetails, WorkItemComment, ChildItemSummary, AttachmentInfo, AttachmentContent } from '../types/azure-devops.types.js';
import { FileSizeLimitError } from '../utils/errorHandler.js';
import { AzureDevOpsClient } from './azureDevOpsClient.js';
import { GDPRValidator } from '../utils/gdprValidator.js';
import { NotFoundError, GDPRComplianceError } from '../utils/errorHandler.js';

export class WorkItemService {
  static async getWorkItem(workItemId: number): Promise<WorkItemDetails> {
    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const config = AzureDevOpsClient.getConfig();

      console.error(`[WorkItem] Fetching work item #${workItemId}...`);

      const [workItem, comments] = await Promise.all([
        api.getWorkItem(
          workItemId,
          undefined,
          undefined,
          1, // expand: Relations
          config.azureDevOpsProject
        ),
        this.fetchComments(workItemId),
      ]);

      if (!workItem) {
        throw new NotFoundError('Work item', workItemId);
      }

      GDPRValidator.validate(workItem);

      const result = this.transformWorkItem(workItem);
      result.comments = comments;
      result.childItems = this.extractChildSummary(workItem.relations);
      result.attachments = this.extractAttachments(workItem.relations);

      return result;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof GDPRComplianceError) {
        throw error;
      }
      console.error(`[WorkItem] Error fetching work item #${workItemId}:`, error);
      throw new Error(`Failed to fetch work item #${workItemId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async getChildWorkItems(
    parentId: number,
    maxDepth: number = 5,
    currentDepth: number = 0
  ): Promise<WorkItemDetails[]> {
    if (currentDepth >= maxDepth) {
      console.error(`[WorkItem] Max depth ${maxDepth} reached for work item #${parentId}`);
      return [];
    }

    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const config = AzureDevOpsClient.getConfig();

      const parent = await api.getWorkItem(
        parentId,
        undefined,
        undefined,
        1, // expand: Relations
        config.azureDevOpsProject
      );

      if (!parent || !parent.relations) {
        return [];
      }

      const childRelations = parent.relations.filter(
        rel => rel.rel === 'System.LinkTypes.Hierarchy-Forward'
      );

      if (childRelations.length === 0) {
        return [];
      }

      const allChildren: WorkItemDetails[] = [];

      for (const relation of childRelations) {
        if (!relation.url) continue;

        const childIdMatch = relation.url.match(/(\d+)$/);
        if (!childIdMatch) continue;

        const childId = parseInt(childIdMatch[1], 10);

        try {
          const childWorkItem = await this.getWorkItem(childId);
          allChildren.push(childWorkItem);

          const grandchildren = await this.getChildWorkItems(childId, maxDepth, currentDepth + 1);
          allChildren.push(...grandchildren);
        } catch (error) {
          console.warn(`[WorkItem] Failed to fetch child work item #${childId}:`, error);
        }
      }

      return allChildren;
    } catch (error) {
      console.error(`[WorkItem] Error fetching children for #${parentId}:`, error);
      return [];
    }
  }

  static async getWorkItemTree(rootId: number, maxDepth: number = 5): Promise<WorkItemTree> {
    const rootWorkItem = await this.getWorkItem(rootId);
    const children = await this.buildWorkItemTree(rootId, maxDepth, 0);

    return {
      workItem: rootWorkItem,
      children,
      depth: 0,
    };
  }

  private static async buildWorkItemTree(
    parentId: number,
    maxDepth: number,
    currentDepth: number
  ): Promise<WorkItemTree[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const config = AzureDevOpsClient.getConfig();

      const parent = await api.getWorkItem(
        parentId,
        undefined,
        undefined,
        1, // expand: Relations
        config.azureDevOpsProject
      );

      if (!parent || !parent.relations) {
        return [];
      }

      const childRelations = parent.relations.filter(
        rel => rel.rel === 'System.LinkTypes.Hierarchy-Forward'
      );

      const childTrees: WorkItemTree[] = [];

      for (const relation of childRelations) {
        if (!relation.url) continue;

        const childIdMatch = relation.url.match(/(\d+)$/);
        if (!childIdMatch) continue;

        const childId = parseInt(childIdMatch[1], 10);

        try {
          const childWorkItem = await this.getWorkItem(childId);
          const grandchildren = await this.buildWorkItemTree(childId, maxDepth, currentDepth + 1);

          childTrees.push({
            workItem: childWorkItem,
            children: grandchildren,
            depth: currentDepth + 1,
          });
        } catch (error) {
          console.warn(`[WorkItem] Failed to build tree for child #${childId}:`, error);
        }
      }

      return childTrees;
    } catch (error) {
      console.error(`[WorkItem] Error building tree for #${parentId}:`, error);
      return [];
    }
  }

  static async getLinkedCommits(workItemId: number): Promise<CommitDetails[]> {
    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const gitApi = await AzureDevOpsClient.getGitApi();
      const config = AzureDevOpsClient.getConfig();

      const workItem = await api.getWorkItem(
        workItemId,
        undefined,
        undefined,
        1, // expand: Relations
        config.azureDevOpsProject
      );

      if (!workItem || !workItem.relations) {
        return [];
      }

      const commitRelations = workItem.relations.filter(
        rel => rel.rel === 'ArtifactLink' && rel.url?.includes('vstfs:///Git/Commit/')
      );

      const commits: CommitDetails[] = [];

      for (const relation of commitRelations) {
        if (!relation.url) continue;

        try {
          const commitUrlMatch = relation.url.match(/\/([^/]+)\/([a-f0-9]{40})/i);
          if (!commitUrlMatch) continue;

          const repositoryId = commitUrlMatch[1];
          const commitId = commitUrlMatch[2];

          const commit = await gitApi.getCommit(commitId, repositoryId);

          if (commit) {
            commits.push({
              commitId: commit.commitId || commitId,
              author: commit.author?.name || 'Unknown',
              authorEmail: commit.author?.email || '',
              date: commit.author?.date || new Date(),
              comment: commit.comment || '',
              repositoryId,
              url: commit.remoteUrl,
            });
          }
        } catch (error) {
          console.warn(`[WorkItem] Failed to fetch commit from relation:`, error);
        }
      }

      return commits;
    } catch (error) {
      console.error(`[WorkItem] Error fetching linked commits for #${workItemId}:`, error);
      return [];
    }
  }

  static async getPullRequestCommits(workItemId: number): Promise<CommitDetails[]> {
    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const gitApi = await AzureDevOpsClient.getGitApi();
      const config = AzureDevOpsClient.getConfig();

      const workItem = await api.getWorkItem(
        workItemId,
        undefined,
        undefined,
        1, // expand: Relations
        config.azureDevOpsProject
      );

      if (!workItem || !workItem.relations) {
        return [];
      }

      const prRelations = workItem.relations.filter(
        rel => rel.rel === 'ArtifactLink' && rel.url?.includes('vstfs:///Git/PullRequestId/')
      );

      const allCommits: CommitDetails[] = [];

      for (const relation of prRelations) {
        if (!relation.url) continue;

        try {
          // Decode URL-encoded slashes before parsing
          const decodedUrl = decodeURIComponent(relation.url);
          // Extract repository ID (second-to-last segment) and PR ID (last segment)
          const prUrlMatch = decodedUrl.match(/\/([a-f0-9-]+)\/(\d+)$/i);
          if (!prUrlMatch) continue;

          const repositoryId = prUrlMatch[1];
          const pullRequestId = parseInt(prUrlMatch[2], 10);

          const commits = await gitApi.getPullRequestCommits(repositoryId, pullRequestId);

          if (commits) {
            for (const commit of commits) {
              allCommits.push({
                commitId: commit.commitId || '',
                author: commit.author?.name || 'Unknown',
                authorEmail: commit.author?.email || '',
                date: commit.author?.date || new Date(),
                comment: commit.comment || '',
                repositoryId,
                url: commit.remoteUrl,
              });
            }
          }
        } catch (error) {
          console.warn(`[WorkItem] Failed to fetch PR commits from relation:`, error);
        }
      }

      return allCommits;
    } catch (error) {
      console.error(`[WorkItem] Error fetching PR commits for #${workItemId}:`, error);
      return [];
    }
  }

  static async getAllCommits(workItemId: number): Promise<CommitDetails[]> {
    const [directCommits, prCommits] = await Promise.all([
      this.getLinkedCommits(workItemId),
      this.getPullRequestCommits(workItemId),
    ]);

    const allCommits = [...directCommits, ...prCommits];

    const uniqueCommits = this.deduplicateCommits(allCommits);

    return uniqueCommits.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private static deduplicateCommits(commits: CommitDetails[]): CommitDetails[] {
    const seen = new Set<string>();
    const unique: CommitDetails[] = [];

    for (const commit of commits) {
      if (!seen.has(commit.commitId)) {
        seen.add(commit.commitId);
        unique.push(commit);
      }
    }

    return unique;
  }

  static async getMyWorkItems(maxResults: number = 200): Promise<WorkItemDetails[]> {
    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const config = AzureDevOpsClient.getConfig();

      console.error(`[WorkItem] Fetching work items assigned to current user (max: ${maxResults})...`);

      // Use WIQL to query work items assigned to the current user with specific states
      const wiql = {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.State] IN ('New', 'In Progress') ORDER BY [System.ChangedDate] DESC`
      };

      console.error(`[WorkItem] Executing WIQL query (filtering for New and In Progress states)`);

      const teamContext = { project: config.azureDevOpsProject };
      const queryResult = await api.queryByWiql(wiql, teamContext);

      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        console.error(`[WorkItem] No work items found assigned to current user`);
        return [];
      }

      console.error(`[WorkItem] Found ${queryResult.workItems.length} work items assigned to current user`);

      // Limit the number of results
      const limitedWorkItems = queryResult.workItems.slice(0, maxResults);
      const workItemIds = limitedWorkItems.map(wi => wi.id!);

      console.error(`[WorkItem] Fetching details for ${workItemIds.length} work items (limited from ${queryResult.workItems.length})...`);

      // Fetch work items in batches of 200 (Azure DevOps API limit)
      const batchSize = 200;
      const allWorkItems: WorkItem[] = [];

      for (let i = 0; i < workItemIds.length; i += batchSize) {
        const batchIds = workItemIds.slice(i, i + batchSize);
        console.error(`[WorkItem] Fetching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(workItemIds.length / batchSize)} (${batchIds.length} items)...`);

        const batchWorkItems = await api.getWorkItems(
          batchIds,
          undefined,
          undefined,
          1, // expand: Relations
          undefined,
          config.azureDevOpsProject
        );

        if (batchWorkItems) {
          allWorkItems.push(...batchWorkItems);
        }
      }

      if (allWorkItems.length === 0) {
        console.error(`[WorkItem] No work items returned from getWorkItems`);
        return [];
      }

      console.error(`[WorkItem] Retrieved ${allWorkItems.length} work items`);

      // Transform items, including GDPR-blocked ones with limited info
      const transformedItems: WorkItemDetails[] = [];
      let gdprBlockedCount = 0;

      for (const workItem of allWorkItems) {
        try {
          GDPRValidator.validate(workItem);
          transformedItems.push(this.transformWorkItem(workItem));
        } catch (error) {
          if (error instanceof GDPRComplianceError) {
            gdprBlockedCount++;
            // Include GDPR-blocked item with limited information
            transformedItems.push(this.transformGDPRBlockedWorkItem(workItem, error.message));
          } else {
            console.warn(`[WorkItem] Failed to transform work item #${workItem.id}:`, error);
          }
        }
      }

      if (gdprBlockedCount > 0) {
        console.error(`[WorkItem] Included ${gdprBlockedCount} GDPR-blocked work items with limited information`);
      }

      console.error(`[WorkItem] Returning ${transformedItems.length} work items (${gdprBlockedCount} GDPR-blocked)`);
      return transformedItems;
    } catch (error) {
      console.error(`[WorkItem] Error fetching work items assigned to current user:`, error);
      throw new Error(`Failed to fetch assigned work items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async downloadAttachment(attachmentUrl: string): Promise<AttachmentContent> {
    const config = AzureDevOpsClient.getConfig();

    // SSRF protection: validate URL origin matches configured Azure DevOps host
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(attachmentUrl);
    } catch {
      throw new Error('Invalid attachment URL');
    }

    const configOrigin = new URL(config.azureDevOpsUrl).origin;
    if (parsedUrl.origin !== configOrigin) {
      throw new Error(`Attachment URL origin does not match configured Azure DevOps host. Expected origin: ${configOrigin}`);
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new Error('Attachment URL must use HTTP or HTTPS protocol');
    }

    console.log(`[WorkItem] Downloading attachment from: ${attachmentUrl}`);

    const authToken = Buffer.from(`:${config.azureDevOpsPat}`).toString('base64');
    const response = await fetch(attachmentUrl, {
      headers: {
        'Authorization': `Basic ${authToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundError('Attachment', attachmentUrl);
      }
      throw new Error(`Failed to download attachment: HTTP ${response.status} ${response.statusText}`);
    }

    // Check Content-Length header before downloading body
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > config.maxFileSizeBytes) {
      const fileName = this.extractFileName(attachmentUrl);
      throw new FileSizeLimitError(fileName, parseInt(contentLength, 10), config.maxFileSizeBytes);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check actual size
    if (buffer.length > config.maxFileSizeBytes) {
      const fileName = this.extractFileName(attachmentUrl);
      throw new FileSizeLimitError(fileName, buffer.length, config.maxFileSizeBytes);
    }

    const contentType = response.headers.get('content-type') || '';
    const mimeType = contentType.split(';')[0].trim() || this.inferMimeType(attachmentUrl);
    const name = this.extractFileName(attachmentUrl);

    console.log(`[WorkItem] Downloaded attachment: ${name} (${buffer.length} bytes, ${mimeType})`);

    return {
      name,
      url: attachmentUrl,
      mimeType,
      size: buffer.length,
      data: buffer.toString('base64'),
    };
  }

  private static extractFileName(url: string): string {
    const parsedUrl = new URL(url);
    const fileNameParam = parsedUrl.searchParams.get('fileName');
    if (fileNameParam) {
      return fileNameParam;
    }
    const pathParts = parsedUrl.pathname.split('/');
    return pathParts[pathParts.length - 1] || 'attachment';
  }

  private static inferMimeType(url: string): string {
    const name = this.extractFileName(url).toLowerCase();
    const ext = name.split('.').pop() || '';
    const mimeMap: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'bmp': 'image/bmp',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'json': 'application/json',
      'xml': 'application/xml',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  private static async fetchComments(workItemId: number): Promise<WorkItemComment[]> {
    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const config = AzureDevOpsClient.getConfig();

      const commentList = await api.getComments(config.azureDevOpsProject, workItemId);

      if (!commentList?.comments) {
        return [];
      }

      return commentList.comments
        .filter(c => !c.isDeleted)
        .map(c => ({
          id: c.id!,
          author: c.createdBy?.displayName || 'Unknown',
          createdDate: c.createdDate || new Date(),
          text: c.text || '',
        }));
    } catch (error) {
      console.warn(`[WorkItem] Failed to fetch comments for #${workItemId}:`, error);
      return [];
    }
  }

  private static extractChildSummary(relations: WorkItem['relations']): ChildItemSummary {
    if (!relations) {
      return { count: 0, childIds: [] };
    }

    const childIds: number[] = [];
    for (const rel of relations) {
      if (rel.rel === 'System.LinkTypes.Hierarchy-Forward' && rel.url) {
        const match = rel.url.match(/(\d+)$/);
        if (match) {
          childIds.push(parseInt(match[1], 10));
        }
      }
    }

    return { count: childIds.length, childIds };
  }

  private static extractAttachments(relations: WorkItem['relations']): AttachmentInfo[] {
    if (!relations) {
      return [];
    }

    return relations
      .filter(rel => rel.rel === 'AttachedFile')
      .map(rel => ({
        name: rel.attributes?.['name'] || 'Unknown',
        url: rel.url || '',
        resourceSize: rel.attributes?.['resourceSize'] || 0,
        createdDate: rel.attributes?.['resourceCreatedDate'] ? new Date(rel.attributes['resourceCreatedDate']) : new Date(),
      }));
  }

  private static transformWorkItem(workItem: WorkItem): WorkItemDetails {
    const fields = workItem.fields || {};

    return {
      id: workItem.id!,
      title: fields['System.Title'] || '',
      description: fields['System.Description'] || '',
      workItemType: fields['System.WorkItemType'] || '',
      state: fields['System.State'] || '',
      assignedTo: fields['System.AssignedTo']?.displayName || fields['System.AssignedTo'],
      createdDate: new Date(fields['System.CreatedDate'] || Date.now()),
      changedDate: new Date(fields['System.ChangedDate'] || Date.now()),
      areaPath: fields['System.AreaPath'] || '',
      iterationPath: fields['System.IterationPath'] || '',
      tags: fields['System.Tags'] ? fields['System.Tags'].split(';').map((t: string) => t.trim()) : [],
      relations: workItem.relations,
      fields,
    };
  }

  private static transformGDPRBlockedWorkItem(workItem: WorkItem, gdprMessage: string): WorkItemDetails {
    const fields = workItem.fields || {};
    const workItemType = fields['System.WorkItemType'] || 'Unknown';

    return {
      id: workItem.id!,
      title: '[GDPR BLOCKED]',
      description: '',
      workItemType: workItemType,
      state: fields['System.State'] || '',
      assignedTo: fields['System.AssignedTo']?.displayName || fields['System.AssignedTo'],
      createdDate: new Date(fields['System.CreatedDate'] || Date.now()),
      changedDate: new Date(fields['System.ChangedDate'] || Date.now()),
      areaPath: '',
      iterationPath: '',
      tags: [],
      fields: {},
      gdprBlocked: true,
      gdprMessage: gdprMessage,
    };
  }

  static async getWeeklyWorkReport(days: number = 7): Promise<any> {
    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const config = AzureDevOpsClient.getConfig();

      console.error(`[WorkItem] Generating weekly work report for last ${days} days...`);

      // Calculate the date threshold
      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - days);
      const dateString = dateThreshold.toISOString().split('T')[0]; // Format: YYYY-MM-DD

      // Use WIQL to query work items assigned to the current user and changed in the last N days
      const wiql = {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.ChangedDate] >= '${dateString}' ORDER BY [System.ChangedDate] DESC`
      };

      console.error(`[WorkItem] Executing WIQL query for work items assigned to current user and changed since ${dateString}`);

      const teamContext = { project: config.azureDevOpsProject };
      const queryResult = await api.queryByWiql(wiql, teamContext);

      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        console.error(`[WorkItem] No work items found changed by current user in the last ${days} days`);
        return {
          reportPeriod: {
            days,
            startDate: dateString,
            endDate: new Date().toISOString().split('T')[0],
          },
          workItems: [],
          totalWorkItems: 0,
          totalCommits: 0,
        };
      }

      console.error(`[WorkItem] Found ${queryResult.workItems.length} work items changed in the last ${days} days`);

      const workItemIds = queryResult.workItems.map(wi => wi.id!);

      // Fetch work items in batches of 200
      const batchSize = 200;
      const allWorkItems: WorkItem[] = [];

      for (let i = 0; i < workItemIds.length; i += batchSize) {
        const batchIds = workItemIds.slice(i, i + batchSize);
        console.error(`[WorkItem] Fetching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(workItemIds.length / batchSize)} (${batchIds.length} items)...`);

        const batchWorkItems = await api.getWorkItems(
          batchIds,
          undefined,
          undefined,
          1, // expand: Relations
          undefined,
          config.azureDevOpsProject
        );

        if (batchWorkItems) {
          allWorkItems.push(...batchWorkItems);
        }
      }

      console.error(`[WorkItem] Retrieved ${allWorkItems.length} work items, fetching commits and parents for each...`);

      // Build report for each work item
      const reportItems = [];
      let totalCommits = 0;

      for (const workItem of allWorkItems) {
        try {
          GDPRValidator.validate(workItem);

          const fields = workItem.fields || {};
          const workItemId = workItem.id!;

          // Get commits for this work item
          const commits = await this.getAllCommits(workItemId);
          totalCommits += commits.length;

          // Extract time registration field (check both possible field names)
          let timeRegistration = fields['Schultz.TimeRegistration'] || fields['Schultz.TimelogID'] || null;

          // Check for parent work item (typically Feature)
          let parentInfo = null;
          if (workItem.relations) {
            const parentRelation = workItem.relations.find(
              rel => rel.rel === 'System.LinkTypes.Hierarchy-Reverse'
            );

            if (parentRelation && parentRelation.url) {
              const parentIdMatch = parentRelation.url.match(/(\d+)$/);
              if (parentIdMatch) {
                const parentId = parseInt(parentIdMatch[1], 10);
                try {
                  const parent = await api.getWorkItem(
                    parentId,
                    undefined,
                    undefined,
                    1, // expand: Relations
                    config.azureDevOpsProject
                  );

                  if (parent && parent.fields) {
                    const parentFields = parent.fields;
                    const parentTimeRegistration = parentFields['Schultz.TimeRegistration'] || parentFields['Schultz.TimelogID'] || null;
                    
                    parentInfo = {
                      id: parentId,
                      title: parentFields['System.Title'] || '',
                      workItemType: parentFields['System.WorkItemType'] || '',
                      timeRegistration: parentTimeRegistration,
                    };

                    // If this work item doesn't have time registration but parent does, use parent's
                    if (!timeRegistration && parentTimeRegistration) {
                      timeRegistration = parentTimeRegistration;
                    }
                  }
                } catch (parentError) {
                  console.warn(`[WorkItem] Failed to fetch parent work item #${parentId}:`, parentError);
                }
              }
            }
          }

          reportItems.push({
            id: workItemId,
            title: fields['System.Title'] || '',
            workItemType: fields['System.WorkItemType'] || '',
            state: fields['System.State'] || '',
            changedDate: fields['System.ChangedDate'] || null,
            commitCount: commits.length,
            timeRegistration: timeRegistration,
            parent: parentInfo,
            commits: commits.map(c => ({
              commitId: c.commitId.substring(0, 8), // Short SHA
              author: c.author,
              date: c.date,
              comment: c.comment.split('\n')[0], // First line only
            })),
          });
        } catch (error) {
          if (error instanceof GDPRComplianceError) {
            console.error(`[WorkItem] Skipping GDPR-blocked work item #${workItem.id}`);
          } else {
            console.warn(`[WorkItem] Failed to process work item #${workItem.id}:`, error);
          }
        }
      }

      console.error(`[WorkItem] Report generated: ${reportItems.length} work items, ${totalCommits} total commits`);

      return {
        reportPeriod: {
          days,
          startDate: dateString,
          endDate: new Date().toISOString().split('T')[0],
        },
        workItems: reportItems,
        totalWorkItems: reportItems.length,
        totalCommits,
      };
    } catch (error) {
      console.error(`[WorkItem] Error generating weekly work report:`, error);
      throw new Error(`Failed to generate weekly work report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
