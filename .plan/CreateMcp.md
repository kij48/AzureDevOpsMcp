Perfect! Now I have a clear picture. Let me create a comprehensive development plan for your Azure DevOps MCP server.

# Azure DevOps MCP Server - Development Plan

## Project Overview
A Model Context Protocol (MCP) server for interacting with self-hosted Azure DevOps Server 7.1, designed for AI code agents (Claude & Copilot) with GDPR-compliant work item handling.

---

## Phase 1: Project Setup & Foundation

### 1.1 Initialize Project Structure
```
mcp-azure-devops/
├── src/
│   ├── index.ts                 # MCP server entry point
│   ├── config.ts                # Configuration management
│   ├── services/
│   │   ├── azureDevOpsClient.ts # API client wrapper
│   │   ├── workItemService.ts   # Work item operations
│   │   ├── pullRequestService.ts # PR operations
│   │   └── repositoryService.ts  # File retrieval
│   ├── tools/
│   │   ├── workItemTools.ts     # Work item MCP tools
│   │   ├── pullRequestTools.ts  # PR MCP tools
│   │   └── fileTools.ts         # File retrieval tools
│   ├── types/
│   │   └── azure-devops.types.ts # TypeScript interfaces
│   └── utils/
│       ├── gdprValidator.ts     # GDPR compliance checker
│       └── errorHandler.ts      # Error handling utilities
├── package.json
├── tsconfig.json
└── README.md
```

### 1.2 Dependencies
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "azure-devops-node-api": "^12.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "@types/node": "^20.x",
    "typescript": "^5.x",
    "tsx": "^4.x"
  }
}
```

---

## Phase 2: Core Services Implementation

### 2.1 Azure DevOps Client Service
**File: `src/services/azureDevOpsClient.ts`**

**Tasks:**
- Initialize connection to Azure DevOps Server 7.1
- Configure PAT authentication
- Create reusable API client instances for:
  - Work Item Tracking API
  - Git API (for PRs and files)
- Implement connection validation
- Handle base URL configuration for self-hosted server

**Key Methods:**
```typescript
- initializeConnection(serverUrl: string, pat: string)
- getWorkItemTrackingApi()
- getGitApi()
- validateConnection()
```

---

### 2.2 Work Item Service
**File: `src/services/workItemService.ts`**

**Tasks:**
- Fetch work item by ID with all relevant fields
- Retrieve child work items (recursive traversal)
- Get commits linked to work item
- Get commits from associated pull requests
- GDPR validation check (block "Bug" type)

**Key Methods:**
```typescript
- getWorkItem(id: number): Promise<WorkItemDetails>
- getChildWorkItems(parentId: number): Promise<WorkItem[]>
- getLinkedCommits(workItemId: number): Promise<Commit[]>
- getPullRequestCommits(workItemId: number): Promise<Commit[]>
- validateGDPRCompliance(workItem: WorkItem): void
```

**Fields to Retrieve:**
- System.Id
- System.Title
- System.Description
- System.WorkItemType
- System.State
- System.AssignedTo
- System.CreatedDate
- System.ChangedDate
- System.AreaPath
- System.IterationPath
- System.Tags
- System.Parent (for hierarchy)
- Custom fields relevant to completion

---

### 2.3 Pull Request Service
**File: `src/services/pullRequestService.ts`**

**Tasks:**
- Retrieve pull request details
- Get PR file changes/diffs
- Get PR commits
- Get PR comments (read-only)

**Key Methods:**
```typescript
- getPullRequest(repositoryId: string, prId: number): Promise<PullRequestDetails>
- getPullRequestChanges(repositoryId: string, prId: number): Promise<FileChange[]>
- getPullRequestCommits(repositoryId: string, prId: number): Promise<Commit[]>
```

---

### 2.4 Repository Service
**File: `src/services/repositoryService.ts`**

**Tasks:**
- Retrieve file content from main branch
- Retrieve file content from PR branch
- Handle file size limits (suggest max 1MB)
- Support multiple file formats

**Key Methods:**
```typescript
- getFileContent(repositoryId: string, path: string, branch?: string): Promise<FileContent>
- getFileFromPullRequest(repositoryId: string, prId: number, path: string): Promise<FileContent>
```

---

## Phase 3: MCP Tools Implementation

### 3.1 Work Item Tools
**File: `src/tools/workItemTools.ts`**

**Tool 1: `get_work_item`**
- **Input:** `workItemId: number`
- **Output:** Complete work item details including children and commits
- **Error Handling:** GDPR block for Bug type

**Tool 2: `get_work_item_children`**
- **Input:** `workItemId: number`
- **Output:** List of child work items

**Tool 3: `get_work_item_commits`**
- **Input:** `workItemId: number`
- **Output:** All commits linked to work item + commits from associated PRs

---

### 3.2 Pull Request Tools
**File: `src/tools/pullRequestTools.ts`**

**Tool 1: `get_pull_request`**
- **Input:** `repositoryId: string, pullRequestId: number`
- **Output:** PR details with metadata

**Tool 2: `get_pull_request_changes`**
- **Input:** `repositoryId: string, pullRequestId: number`
- **Output:** File changes and diffs

**Tool 3: `get_pull_request_commits`**
- **Input:** `repositoryId: string, pullRequestId: number`
- **Output:** List of commits in PR

---

### 3.3 File Tools
**File: `src/tools/fileTools.ts`**

**Tool 1: `get_file_content`**
- **Input:** `repositoryId: string, filePath: string, branch?: string`
- **Output:** File content (default: main branch)

**Tool 2: `get_file_from_pr`**
- **Input:** `repositoryId: string, pullRequestId: number, filePath: string`
- **Output:** File content from PR branch

---

## Phase 4: GDPR Compliance & Error Handling

### 4.1 GDPR Validator
**File: `src/utils/gdprValidator.ts`**

**Implementation:**
```typescript
export class GDPRValidator {
  static validateWorkItem(workItem: WorkItem): void {
    if (workItem.fields['System.WorkItemType'] === 'Bug') {
      throw new GDPRComplianceError(
        `Access to Bug work item #${workItem.id} is blocked by GDPR policy. ` +
        `Bug work items may contain personal data and cannot be accessed through this API.`
      );
    }
  }
}
```

### 4.2 Error Handler
**File: `src/utils/errorHandler.ts`**

**Error Types:**
- `GDPRComplianceError` - GDPR policy violations
- `AuthenticationError` - PAT or connection issues
- `NotFoundError` - Work item/PR/file not found
- `PermissionError` - Insufficient permissions
- `FileSizeLimitError` - File too large

---

## Phase 5: Configuration & Environment

### 5.1 Environment Variables
**File: `.env`**
```
AZURE_DEVOPS_URL=https://your-devops-server.com
AZURE_DEVOPS_PAT=your_personal_access_token
AZURE_DEVOPS_ORGANIZATION=your_org
AZURE_DEVOPS_PROJECT=your_project
MAX_FILE_SIZE_MB=1
```

### 5.2 Configuration Management
**File: `src/config.ts`**
- Load and validate environment variables
- Provide typed configuration object
- Handle missing required variables

---

## Phase 6: MCP Server Setup

### 6.1 Server Implementation
**File: `src/index.ts`**

**Tasks:**
- Initialize MCP server
- Register all tools
- Set up request handlers
- Implement health check
- Add logging

**Reference API from:** 
`https://github.com/Tiberriver256/mcp-server-azure-devops`

---

## Phase 7: Testing & Documentation

### 7.1 Testing Strategy
- Unit tests for each service
- Integration tests with mock Azure DevOps API
- GDPR validation tests
- Error handling tests

### 7.2 Documentation
**README.md sections:**
- Installation instructions
- Configuration guide
- PAT setup for Azure DevOps Server 7.1
- Available tools and their usage
- GDPR compliance notes
- Troubleshooting guide
- Example usage with Claude/Copilot

---

## Implementation Priority Order

1. **Phase 1-2:** Foundation & Core Services (Days 1-2)
2. **Phase 4:** GDPR Compliance (Day 2)
3. **Phase 3:** MCP Tools (Days 3-4)
4. **Phase 5-6:** Configuration & Server (Day 4)
5. **Phase 7:** Testing & Documentation (Day 5)

---

## Key Technical Decisions

✅ **Node.js with TypeScript** - Type safety and better Azure DevOps API support  
✅ **azure-devops-node-api** - Official SDK for Azure DevOps  
✅ **Read-only operations** - No write/update capabilities for safety  
✅ **GDPR-first approach** - Validation before any data retrieval  
✅ **Branch flexibility** - Support both main and PR branches  

---



