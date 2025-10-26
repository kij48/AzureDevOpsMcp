# Azure DevOps MCP Server - Implementation Plan

## High-Level Approach

This implementation will create a Model Context Protocol (MCP) server that interfaces with Azure DevOps Server 7.1. The server will expose read-only tools for AI agents (Claude, Copilot) to access work items, pull requests, and repository files while enforcing GDPR compliance.

### Strategy
1. **Foundation First**: Set up project structure, dependencies, and configuration
2. **Core Services Layer**: Implement Azure DevOps API client wrappers
3. **Business Logic Layer**: Add GDPR validation and data transformation
4. **MCP Tools Layer**: Expose functionality as MCP tools
5. **Testing & Documentation**: Validate functionality and document usage

---

## Step-by-Step Implementation Sequence

### Stage 1: Project Foundation (Day 1)

#### 1.1 Initialize Node.js Project
- Create `package.json` with project metadata
- Configure TypeScript with `tsconfig.json`
- Set up build and start scripts
- Add `.gitignore` for Node.js projects

#### 1.2 Install Dependencies
```bash
npm install @modelcontextprotocol/sdk azure-devops-node-api dotenv
npm install -D @types/node typescript tsx
```

#### 1.3 Create Project Structure
```
src/
├── index.ts                    # MCP server entry point
├── config.ts                   # Configuration management
├── services/
│   ├── azureDevOpsClient.ts    # Azure DevOps connection
│   ├── workItemService.ts      # Work item operations
│   ├── pullRequestService.ts   # PR operations
│   └── repositoryService.ts    # File retrieval
├── tools/
│   ├── workItemTools.ts        # Work item MCP tools
│   ├── pullRequestTools.ts     # PR MCP tools
│   └── fileTools.ts            # File retrieval MCP tools
├── types/
│   └── azure-devops.types.ts   # TypeScript interfaces
└── utils/
    ├── gdprValidator.ts        # GDPR compliance checker
    └── errorHandler.ts         # Error handling
```

---

### Stage 2: Configuration & Error Handling (Day 1-2)

#### 2.1 Configuration Management (`src/config.ts`)
- Load environment variables from `.env`
- Validate required configuration (URL, PAT, org, project)
- Export typed configuration object
- Handle missing/invalid configuration gracefully

**Required Environment Variables:**
```
AZURE_DEVOPS_URL=https://your-server.com
AZURE_DEVOPS_PAT=your_personal_access_token
AZURE_DEVOPS_ORGANIZATION=YourOrg
AZURE_DEVOPS_PROJECT=YourProject
GDPR_BLOCKED_WORK_ITEM_TYPES=Bug
MAX_FILE_SIZE_MB=1
```

#### 2.2 Error Handler (`src/utils/errorHandler.ts`)
Define custom error classes:
- `GDPRComplianceError` - GDPR policy violations
- `AuthenticationError` - PAT or connection failures
- `NotFoundError` - Work item/PR/file not found
- `PermissionError` - Insufficient permissions
- `FileSizeLimitError` - File exceeds size limit

#### 2.3 GDPR Validator (`src/utils/gdprValidator.ts`)
- Check work item type against blocked list
- Throw `GDPRComplianceError` if blocked
- Log compliance checks for audit trail

---

### Stage 3: Azure DevOps Client Services (Day 2-3)

#### 3.1 Azure DevOps Client (`src/services/azureDevOpsClient.ts`)
**Purpose**: Initialize and manage connection to Azure DevOps Server

**Implementation Steps:**
1. Create connection using `azure-devops-node-api`
2. Initialize Work Item Tracking API client
3. Initialize Git API client
4. Implement connection validation method
5. Handle authentication errors

**Key Methods:**
```typescript
class AzureDevOpsClient {
  static async initialize(config: Config): Promise<void>
  static getWorkItemTrackingApi(): Promise<IWorkItemTrackingApi>
  static getGitApi(): Promise<IGitApi>
  static async validateConnection(): Promise<boolean>
}
```

#### 3.2 Work Item Service (`src/services/workItemService.ts`)
**Purpose**: Retrieve work item data with GDPR validation

**Implementation Steps:**
1. Fetch work item by ID with expanded fields
2. Validate GDPR compliance before returning
3. Retrieve child work items recursively
4. Get commits linked to work item
5. Get commits from associated pull requests
6. Combine and deduplicate commit lists

**Key Methods:**
```typescript
async getWorkItem(id: number): Promise<WorkItemDetails>
async getChildWorkItems(parentId: number): Promise<WorkItem[]>
async getLinkedCommits(workItemId: number): Promise<Commit[]>
async getPullRequestCommits(workItemId: number): Promise<Commit[]>
async getWorkItemTree(rootId: number): Promise<WorkItemTree>
```

**Fields to Retrieve:**
- System.Id, System.Title, System.Description
- System.WorkItemType, System.State
- System.AssignedTo, System.CreatedDate, System.ChangedDate
- System.AreaPath, System.IterationPath, System.Tags
- System.Parent (for hierarchy navigation)
- Relations (for linked commits and PRs)

#### 3.3 Pull Request Service (`src/services/pullRequestService.ts`)
**Purpose**: Retrieve pull request data and changes

**Implementation Steps:**
1. Get PR by repository and PR ID
2. Retrieve PR file changes/diffs
3. Get PR commits with metadata
4. Retrieve PR comments (read-only)
5. Handle pagination for large change sets

**Key Methods:**
```typescript
async getPullRequest(repoId: string, prId: number): Promise<PullRequest>
async getPullRequestChanges(repoId: string, prId: number): Promise<FileChange[]>
async getPullRequestCommits(repoId: string, prId: number): Promise<Commit[]>
async getPullRequestComments(repoId: string, prId: number): Promise<Comment[]>
```

#### 3.4 Repository Service (`src/services/repositoryService.ts`)
**Purpose**: Retrieve file content from repositories

**Implementation Steps:**
1. Get file content from specific branch (default: main)
2. Get file content from PR branch
3. Validate file size before retrieval
4. Handle binary files appropriately
5. Support various file encodings

**Key Methods:**
```typescript
async getFileContent(repoId: string, path: string, branch?: string): Promise<FileContent>
async getFileFromPullRequest(repoId: string, prId: number, path: string): Promise<FileContent>
async validateFileSize(repoId: string, path: string): Promise<boolean>
```

---

### Stage 4: TypeScript Types (Day 3)

#### 4.1 Type Definitions (`src/types/azure-devops.types.ts`)
Define interfaces for:
- `WorkItemDetails` - Complete work item with metadata
- `WorkItemTree` - Hierarchical work item structure
- `Commit` - Git commit information
- `PullRequest` - PR details and metadata
- `FileChange` - File modification details
- `FileContent` - File content and encoding
- `Config` - Application configuration

---

### Stage 5: MCP Tools Implementation (Day 3-4)

#### 5.1 Work Item Tools (`src/tools/workItemTools.ts`)

**Tool: `get_work_item`**
- **Input**: `{ workItemId: number }`
- **Output**: Complete work item details including children and commits
- **GDPR Check**: Validate before retrieval
- **Error Handling**: Handle not found, permission errors

**Tool: `get_work_item_children`**
- **Input**: `{ workItemId: number }`
- **Output**: Array of child work items (one level deep)

**Tool: `get_work_item_commits`**
- **Input**: `{ workItemId: number }`
- **Output**: Deduplicated list of commits from direct links and associated PRs

**Tool: `get_work_item_tree`**
- **Input**: `{ workItemId: number, maxDepth?: number }`
- **Output**: Hierarchical tree of work items
- **Default max depth**: 5 levels

#### 5.2 Pull Request Tools (`src/tools/pullRequestTools.ts`)

**Tool: `get_pull_request`**
- **Input**: `{ repositoryId: string, pullRequestId: number }`
- **Output**: PR details with metadata

**Tool: `get_pull_request_changes`**
- **Input**: `{ repositoryId: string, pullRequestId: number }`
- **Output**: File changes with diffs

**Tool: `get_pull_request_commits`**
- **Input**: `{ repositoryId: string, pullRequestId: number }`
- **Output**: List of commits in PR

#### 5.3 File Tools (`src/tools/fileTools.ts`)

**Tool: `get_file_content`**
- **Input**: `{ repositoryId: string, filePath: string, branch?: string }`
- **Output**: File content (default branch: main)
- **Validation**: Check file size limit

**Tool: `get_file_from_pr`**
- **Input**: `{ repositoryId: string, pullRequestId: number, filePath: string }`
- **Output**: File content from PR branch

---

### Stage 6: MCP Server Setup (Day 4)

#### 6.1 Server Implementation (`src/index.ts`)

**Implementation Steps:**
1. Import MCP SDK and initialize server
2. Load configuration and validate
3. Initialize Azure DevOps client
4. Register all tools with MCP server
5. Set up request handlers for each tool
6. Implement health check endpoint
7. Add structured logging
8. Handle graceful shutdown

**Server Initialization:**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'azure-devops-mcp-server',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Tool definitions
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Tool execution logic
});
```

**Reference Implementation:**
Study the API patterns from: `https://github.com/Tiberriver256/mcp-server-azure-devops`

---

### Stage 7: Testing & Documentation (Day 5)

#### 7.1 Create Test Structure
```
tests/
├── unit/
│   ├── services/
│   │   ├── workItemService.test.ts
│   │   ├── pullRequestService.test.ts
│   │   └── repositoryService.test.ts
│   └── utils/
│       ├── gdprValidator.test.ts
│       └── errorHandler.test.ts
└── integration/
    └── mcp-tools.test.ts
```

#### 7.2 Testing Priorities
1. GDPR validator (critical for compliance)
2. Error handling and edge cases
3. Work item service with mock API
4. Tool registration and execution
5. Configuration validation

#### 7.3 Documentation (`README.md`)
**Sections:**
1. **Overview**: What the MCP server does
2. **Installation**: Step-by-step setup
3. **Configuration**: Environment variables and PAT setup
4. **Available Tools**: Complete tool reference
5. **GDPR Compliance**: Blocked work item types
6. **Usage Examples**: Claude/Copilot integration
7. **Troubleshooting**: Common issues and solutions
8. **Contributing**: Development setup

---

## Files to be Created

### Configuration Files
- `package.json` - Project metadata and dependencies
- `tsconfig.json` - TypeScript compiler configuration
- `.gitignore` - Git ignore patterns
- `.env.example` - Example environment variables
- `README.md` - Project documentation

### Source Files (17 files)
- `src/index.ts`
- `src/config.ts`
- `src/services/azureDevOpsClient.ts`
- `src/services/workItemService.ts`
- `src/services/pullRequestService.ts`
- `src/services/repositoryService.ts`
- `src/tools/workItemTools.ts`
- `src/tools/pullRequestTools.ts`
- `src/tools/fileTools.ts`
- `src/types/azure-devops.types.ts`
- `src/utils/gdprValidator.ts`
- `src/utils/errorHandler.ts`

### Test Files (6 files)
- `tests/unit/services/workItemService.test.ts`
- `tests/unit/services/pullRequestService.test.ts`
- `tests/unit/services/repositoryService.test.ts`
- `tests/unit/utils/gdprValidator.test.ts`
- `tests/unit/utils/errorHandler.test.ts`
- `tests/integration/mcp-tools.test.ts`

**Total: ~25 files**

---

## Dependencies and Integration Points

### External Dependencies
1. **@modelcontextprotocol/sdk** - MCP server framework
2. **azure-devops-node-api** - Official Azure DevOps API client
3. **dotenv** - Environment variable management
4. **TypeScript** - Type safety and compilation
5. **tsx** - TypeScript execution

### Integration Points
1. **Azure DevOps Server 7.1 REST API** - All data retrieval
2. **MCP Client (Claude/Copilot)** - Tool consumption
3. **Environment Configuration** - Runtime configuration

### API Compatibility
- Azure DevOps Server 7.1 (primary target)
- Azure DevOps Services (cloud) - should work with same API
- Backward compatibility with TFS 2018+ (likely but not guaranteed)

---

## Risk Mitigation Strategies

### Risk 1: Azure DevOps Server 7.1 API Compatibility
**Mitigation:**
- Use `azure-devops-node-api` v12.x which supports Server 7.1
- Test against actual Azure DevOps Server 7.1 instance
- Document any API limitations discovered
- Implement graceful degradation for missing features

### Risk 2: GDPR Compliance Enforcement
**Mitigation:**
- Validate GDPR rules at earliest point (before API calls)
- Make blocked work item types configurable
- Log all compliance checks for audit
- Provide clear error messages for blocked access

### Risk 3: Large File Retrieval Performance
**Mitigation:**
- Implement file size limits (default 1MB)
- Validate file size before retrieval
- Return file metadata when size exceeded
- Stream large files if needed (future enhancement)

### Risk 4: Authentication and Permissions
**Mitigation:**
- Validate PAT on startup
- Provide clear error messages for auth failures
- Document required PAT scopes
- Handle token expiration gracefully

### Risk 5: Rate Limiting
**Mitigation:**
- Implement exponential backoff for API calls
- Cache frequently accessed data (work items)
- Document rate limit expectations
- Add retry logic for transient failures

### Risk 6: MCP SDK Learning Curve
**Mitigation:**
- Study reference implementation (Tiberriver256)
- Start with simple tools, add complexity incrementally
- Test each tool independently before integration
- Use TypeScript for better IDE support

---

## Performance Considerations

1. **Lazy Loading**: Only fetch data when requested
2. **Pagination**: Handle large result sets properly
3. **Caching**: Consider caching work item metadata (future)
4. **Parallel Requests**: Fetch commits and PRs concurrently
5. **Error Recovery**: Fail gracefully without crashing server

---

## Security Considerations

1. **PAT Storage**: Use environment variables, never commit
2. **GDPR Compliance**: Enforce blocking before data access
3. **Read-Only**: No write/update/delete operations
4. **Input Validation**: Validate all tool inputs
5. **Error Sanitization**: Don't leak sensitive info in errors

---

## Success Criteria

✅ MCP server starts and connects to Azure DevOps Server 7.1
✅ All tools registered and discoverable by MCP clients
✅ GDPR validator blocks Bug work items
✅ Work item retrieval includes children and commits
✅ Pull request tools return changes and metadata
✅ File retrieval respects size limits
✅ Comprehensive error handling with clear messages
✅ Documentation complete with examples
✅ Build completes without errors or warnings
✅ Core tests passing (GDPR, error handling, services)

---

## Future Enhancements (Out of Scope for v1)

- Caching layer for work item metadata
- Webhook support for change notifications
- Write operations (create comments, update work items)
- Advanced search and filtering
- Multi-project support in single server instance
- Telemetry and usage analytics
- Rate limit management
- Bulk operations support
