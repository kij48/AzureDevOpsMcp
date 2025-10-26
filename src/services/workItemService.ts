import type { WorkItem } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';
import type { WorkItemDetails, WorkItemTree, CommitDetails } from '../types/azure-devops.types.js';
import { AzureDevOpsClient } from './azureDevOpsClient.js';
import { GDPRValidator } from '../utils/gdprValidator.js';
import { NotFoundError, GDPRComplianceError } from '../utils/errorHandler.js';

export class WorkItemService {
  static async getWorkItem(workItemId: number): Promise<WorkItemDetails> {
    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const config = AzureDevOpsClient.getConfig();

      console.log(`[WorkItem] Fetching work item #${workItemId}...`);

      const workItem = await api.getWorkItem(
        workItemId,
        undefined,
        undefined,
        undefined,
        config.azureDevOpsProject
      );

      if (!workItem) {
        throw new NotFoundError('Work item', workItemId);
      }

      GDPRValidator.validate(workItem);

      return this.transformWorkItem(workItem);
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
      console.log(`[WorkItem] Max depth ${maxDepth} reached for work item #${parentId}`);
      return [];
    }

    try {
      const api = await AzureDevOpsClient.getWorkItemTrackingApi();
      const config = AzureDevOpsClient.getConfig();

      const parent = await api.getWorkItem(
        parentId,
        undefined,
        undefined,
        undefined,
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
        undefined,
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
        undefined,
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
        undefined,
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
          const prUrlMatch = relation.url.match(/\/([^/]+)\/(\d+)/);
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

      console.log(`[WorkItem] Fetching work items assigned to current user (max: ${maxResults})...`);

      // Use WIQL to query work items assigned to the current user with specific states
      const wiql = {
        query: `SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.State] IN ('New', 'In Progress') ORDER BY [System.ChangedDate] DESC`
      };

      console.log(`[WorkItem] Executing WIQL query (filtering for New and In Progress states)`);

      const teamContext = { project: config.azureDevOpsProject };
      const queryResult = await api.queryByWiql(wiql, teamContext);

      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        console.log(`[WorkItem] No work items found assigned to current user`);
        return [];
      }

      console.log(`[WorkItem] Found ${queryResult.workItems.length} work items assigned to current user`);

      // Limit the number of results
      const limitedWorkItems = queryResult.workItems.slice(0, maxResults);
      const workItemIds = limitedWorkItems.map(wi => wi.id!);

      console.log(`[WorkItem] Fetching details for ${workItemIds.length} work items (limited from ${queryResult.workItems.length})...`);

      // Fetch work items in batches of 200 (Azure DevOps API limit)
      const batchSize = 200;
      const allWorkItems: WorkItem[] = [];

      for (let i = 0; i < workItemIds.length; i += batchSize) {
        const batchIds = workItemIds.slice(i, i + batchSize);
        console.log(`[WorkItem] Fetching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(workItemIds.length / batchSize)} (${batchIds.length} items)...`);

        const batchWorkItems = await api.getWorkItems(
          batchIds,
          undefined,
          undefined,
          undefined,
          undefined,
          config.azureDevOpsProject
        );

        if (batchWorkItems) {
          allWorkItems.push(...batchWorkItems);
        }
      }

      if (allWorkItems.length === 0) {
        console.log(`[WorkItem] No work items returned from getWorkItems`);
        return [];
      }

      console.log(`[WorkItem] Retrieved ${allWorkItems.length} work items`);

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
        console.log(`[WorkItem] Included ${gdprBlockedCount} GDPR-blocked work items with limited information`);
      }

      console.log(`[WorkItem] Returning ${transformedItems.length} work items (${gdprBlockedCount} GDPR-blocked)`);
      return transformedItems;
    } catch (error) {
      console.error(`[WorkItem] Error fetching work items assigned to current user:`, error);
      throw new Error(`Failed to fetch assigned work items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
}
