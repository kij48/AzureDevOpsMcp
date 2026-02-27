import type { GitCommitRef, GitPullRequest, GitChange } from 'azure-devops-node-api/interfaces/GitInterfaces.js';
import type { WorkItem, WorkItemRelation } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces.js';

export interface Config {
  azureDevOpsUrl: string;
  azureDevOpsPat: string;
  azureDevOpsProject: string;
  gdprBlockedWorkItemTypes: string[];
  maxFileSizeBytes: number;
}

export interface WorkItemDetails {
  id: number;
  title: string;
  description: string;
  workItemType: string;
  state: string;
  assignedTo?: string;
  createdDate: Date;
  changedDate: Date;
  areaPath: string;
  iterationPath: string;
  tags: string[];
  relations?: WorkItemRelation[];
  fields: Record<string, any>;
  gdprBlocked?: boolean;
  gdprMessage?: string;
}

export interface WorkItemTree {
  workItem: WorkItemDetails;
  children: WorkItemTree[];
  depth: number;
}

export interface CommitDetails {
  commitId: string;
  author: string;
  authorEmail: string;
  date: Date;
  comment: string;
  repositoryId?: string;
  url?: string;
}

export interface PullRequestDetails {
  pullRequestId: number;
  title: string;
  description: string;
  sourceRefName: string;
  targetRefName: string;
  status: string;
  createdBy: string;
  creationDate: Date;
  closedDate?: Date;
  repositoryId: string;
  url?: string;
}

export interface FileChangeDetails {
  changeType: string;
  path: string;
  url?: string;
}

export interface FileContent {
  path: string;
  content: string;
  encoding?: string;
  size: number;
  repositoryId: string;
  branch?: string;
}

export interface PullRequestThreadComment {
  id: number;
  content: string;
  author: string;
  publishedDate: Date;
  lastUpdatedDate?: Date;
  parentCommentId?: number;
  isDeleted?: boolean;
}

export interface PullRequestThread {
  id: number;
  status: string;
  comments: PullRequestThreadComment[];
  filePath?: string;
  publishedDate?: Date;
  lastUpdatedDate?: Date;
  isDeleted?: boolean;
}

export { WorkItem, GitCommitRef, GitPullRequest, GitChange };
