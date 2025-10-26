# Solution Description - Azure DevOps MCP Server

## Problem Statement

AI code agents like Claude and GitHub Copilot need structured access to Azure DevOps work items, pull requests, and repository files to understand project context and assist with development tasks. However, several challenges exist:

1. **GDPR Compliance**: Bug work items may contain personal data (customer names, emails, etc.) and must be blocked from AI agent access
2. **Self-Hosted Server**: The solution must work with Azure DevOps Server 7.1 (on-premises), not just cloud services
3. **Context Gathering**: AI agents need to understand work item hierarchies, associated code changes (commits), and related pull requests
4. **Read-Only Access**: For safety, the MCP server should provide read-only operations without write capabilities
5. **File Access**: Agents need to retrieve file content from repositories and pull request branches

---

## Chosen Approach and Rationale

### Architecture: Model Context Protocol (MCP) Server

**What is MCP?**
The Model Context Protocol is a standard for AI agents to interact with external data sources through well-defined "tools". Each tool represents a specific operation (e.g., "get work item", "get pull request").

**Why MCP?**
- **Standardized**: Works with multiple AI agents (Claude, Copilot, etc.)
- **Tool-Based**: Clear separation of concerns, each tool has specific purpose
- **Type-Safe**: Built-in schema validation for inputs/outputs
- **Discoverable**: AI agents can query available tools at runtime

### Technology Stack

**Node.js + TypeScript**
- **Rationale**: Official `azure-devops-node-api` SDK available
- **Benefits**: Type safety, better IDE support, catches errors at compile time
- **Ecosystem**: Rich tooling, easy dependency management

**azure-devops-node-api v12.x**
- **Rationale**: Official Microsoft SDK supporting Azure DevOps Server 7.1
- **Benefits**: Handles authentication, API versioning, type definitions
- **Compatibility**: Works with both Server 7.1 and Azure DevOps Services

**@modelcontextprotocol/sdk**
- **Rationale**: Official MCP SDK from Anthropic
- **Benefits**: Handles MCP protocol, tool registration, request routing
- **Standards**: Ensures compatibility with MCP clients

### Layered Architecture

```
┌─────────────────────────────────────┐
│   MCP Client (Claude/Copilot)      │
└─────────────┬───────────────────────┘
              │ MCP Protocol
┌─────────────▼───────────────────────┐
│   MCP Tools Layer                   │
│   (workItemTools, prTools, etc.)    │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│   Business Logic Layer              │
│   (GDPR Validator, Data Transform)  │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│   Services Layer                    │
│   (workItemService, prService, etc.)│
└─────────────┬───────────────────────┘
              │ azure-devops-node-api
┌─────────────▼───────────────────────┐
│   Azure DevOps Server 7.1 REST API  │
└─────────────────────────────────────┘
```

**Benefits of Layered Approach:**
1. **Separation of Concerns**: Each layer has distinct responsibility
2. **Testability**: Easy to mock dependencies and test layers independently
3. **Maintainability**: Changes in one layer don't cascade to others
4. **Reusability**: Services can be used by multiple tools

---

## Key Design Decisions

### Decision 1: GDPR Validation at Service Layer

**Choice**: Validate GDPR compliance in `workItemService.ts` before API calls

**Alternatives Considered:**
- Validate at tool layer (after data retrieval)
- Validate at API client layer (too low-level)

**Rationale:**
- Fail fast: Don't make unnecessary API calls for blocked items
- Audit trail: Log compliance checks at service layer
- Consistency: All work item operations go through same validation
- Performance: Avoid fetching data that will be rejected

**Implementation:**
```typescript
async getWorkItem(id: number): Promise<WorkItemDetails> {
  const rawWorkItem = await workItemApi.getWorkItem(id);
  GDPRValidator.validate(rawWorkItem); // Throws if blocked
  return this.transformWorkItem(rawWorkItem);
}
```

### Decision 2: Configurable GDPR Blocking

**Choice**: Use environment variable `GDPR_BLOCKED_WORK_ITEM_TYPES=Bug`

**Alternatives Considered:**
- Hardcoded "Bug" blocking
- Config file (JSON/YAML)
- Runtime configuration via API

**Rationale:**
- Flexibility: Different deployments may have different policies
- Default safety: "Bug" blocked by default
- Simple: Single environment variable, no config file parsing
- Auditable: Environment variables logged at startup

**Example:**
```
GDPR_BLOCKED_WORK_ITEM_TYPES=Bug,Issue,Incident
```

### Decision 3: Recursive Child Work Item Retrieval

**Choice**: Implement `getChildWorkItems` with recursive traversal and max depth

**Alternatives Considered:**
- Flat child list (one level only)
- Unlimited recursion (risk of deep hierarchies)

**Rationale:**
- Complete context: AI agents need full work item hierarchy
- Safety: Max depth prevents infinite loops and stack overflow
- Performance: Limit prevents excessive API calls
- Flexibility: Configurable max depth (default: 5 levels)

**Algorithm:**
```typescript
async getChildWorkItems(parentId: number, maxDepth = 5, currentDepth = 0): Promise<WorkItem[]> {
  if (currentDepth >= maxDepth) return [];

  const children = await fetchDirectChildren(parentId);
  const allDescendants = [];

  for (const child of children) {
    allDescendants.push(child);
    const grandchildren = await this.getChildWorkItems(child.id, maxDepth, currentDepth + 1);
    allDescendants.push(...grandchildren);
  }

  return allDescendants;
}
```

### Decision 4: Commit Deduplication from Multiple Sources

**Choice**: Retrieve commits from both direct links and associated PRs, then deduplicate

**Rationale:**
- Complete picture: Some commits linked directly, others via PRs
- Accuracy: Deduplication prevents showing same commit twice
- Context: AI agents see all code changes for a work item

**Implementation:**
```typescript
async getAllCommitsForWorkItem(id: number): Promise<Commit[]> {
  const directCommits = await this.getLinkedCommits(id);
  const prCommits = await this.getPullRequestCommits(id);

  const allCommits = [...directCommits, ...prCommits];
  const uniqueCommits = deduplicateByCommitId(allCommits);

  return uniqueCommits.sort((a, b) => b.date - a.date); // Newest first
}
```

### Decision 5: File Size Limit Enforcement

**Choice**: Validate file size before retrieval, return error if exceeded

**Alternatives Considered:**
- Stream large files in chunks
- Retrieve and truncate large files
- No size limit (risk of memory issues)

**Rationale:**
- Memory safety: Large files can crash Node.js process
- User control: Configurable limit via `MAX_FILE_SIZE_MB`
- Clear feedback: Error message suggests using Git client for large files
- Reasonable default: 1MB handles most source code files

**Implementation:**
```typescript
async getFileContent(repoId: string, path: string): Promise<FileContent> {
  const metadata = await gitApi.getItemMetadata(repoId, path);

  if (metadata.size > config.maxFileSizeBytes) {
    throw new FileSizeLimitError(
      `File ${path} is ${metadata.size} bytes, exceeds limit of ${config.maxFileSizeBytes} bytes`
    );
  }

  return await gitApi.getItemContent(repoId, path);
}
```

### Decision 6: Read-Only Operations Only

**Choice**: No tools for creating, updating, or deleting Azure DevOps entities

**Rationale:**
- Safety: Prevents accidental data modification by AI agents
- Trust: Users can confidently grant access without fear of changes
- Simplicity: No need for complex permission management
- Future enhancement: Write operations can be added in v2 with user confirmation

### Decision 7: Error Handling with Custom Error Classes

**Choice**: Define specific error types (GDPRComplianceError, NotFoundError, etc.)

**Alternatives Considered:**
- Generic Error with messages
- Error codes without classes
- HTTP-style status codes

**Rationale:**
- Type safety: TypeScript can type-check error handling
- Clarity: Error type conveys meaning immediately
- Extensibility: Easy to add error-specific properties
- Debugging: Stack traces include specific error class

**Example:**
```typescript
class GDPRComplianceError extends Error {
  constructor(workItemId: number, workItemType: string) {
    super(`Work item #${workItemId} of type "${workItemType}" is blocked by GDPR policy`);
    this.name = 'GDPRComplianceError';
    this.workItemId = workItemId;
    this.workItemType = workItemType;
  }
}
```

---

## Algorithm Explanation

### Core Flow: Get Work Item with Complete Context

This is the primary use case for AI agents:

```
1. AI Agent requests work item #12345
   ↓
2. MCP Server receives tool call "get_work_item" with id=12345
   ↓
3. workItemService.getWorkItem(12345)
   a. Fetch work item from Azure DevOps API
   b. GDPR Validator checks work item type
      - If "Bug" → throw GDPRComplianceError
      - Else → continue
   c. Transform API response to WorkItemDetails
   d. Return to tool handler
   ↓
4. (Optional) Get child work items
   a. Find work item relations of type "Child"
   b. Recursively fetch children up to max depth
   c. Apply GDPR validation to each child
   d. Return hierarchical structure
   ↓
5. Get commits for work item
   a. Find relations of type "ArtifactLink" (commits)
   b. Fetch commit details from Git API
   c. Find relations of type "Pull Request"
   d. For each PR, get all commits
   e. Deduplicate commits by ID
   f. Sort by date (newest first)
   ↓
6. Combine all data and return to AI agent
   {
     workItem: { id, title, description, ... },
     children: [ ... ],
     commits: [ ... ]
   }
```

### GDPR Validation Flow

```
┌─────────────────────────┐
│ Work Item Request       │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│ Fetch Work Item (API)   │
└──────────┬──────────────┘
           │
┌──────────▼──────────────────────┐
│ GDPR Validator                  │
│ if (type in blockedTypes):      │
│   throw GDPRComplianceError     │
└──────────┬──────────────────────┘
           │
      ┌────┴────┐
      │         │
   ✅ Pass    ❌ Blocked
      │         │
      │    ┌────▼────────────────────┐
      │    │ Return Error to Client  │
      │    │ "Bug work items blocked"│
      │    └─────────────────────────┘
      │
┌─────▼──────────────────┐
│ Return Work Item Data  │
└────────────────────────┘
```

---

## Expected Outcomes

### Functional Outcomes

1. **Work Item Access**
   - AI agents can retrieve work item details by ID
   - Hierarchical work item trees accessible
   - All commits related to work item discoverable
   - GDPR-compliant blocking of Bug work items

2. **Pull Request Access**
   - PR metadata and status retrievable
   - File changes and diffs accessible
   - PR commits listed with metadata
   - PR comments readable (if implemented)

3. **Repository File Access**
   - File content from main branch retrievable
   - File content from PR branches accessible
   - File size limits enforced
   - Binary files handled appropriately

### Non-Functional Outcomes

1. **Security**
   - PAT-based authentication
   - Read-only operations only
   - GDPR compliance enforced
   - No sensitive data leaked in errors

2. **Reliability**
   - Graceful error handling
   - Connection validation on startup
   - Retry logic for transient failures
   - Clear error messages

3. **Performance**
   - Lazy loading (fetch only when requested)
   - Pagination for large result sets
   - File size limits prevent memory issues
   - Concurrent API calls where possible

4. **Usability**
   - Clear tool names and descriptions
   - Comprehensive documentation
   - Example usage with Claude/Copilot
   - Troubleshooting guide

5. **Maintainability**
   - Clean layered architecture
   - TypeScript type safety
   - Comprehensive tests
   - Inline documentation

---

## Success Metrics

### Implementation Complete When:
✅ All 8 MCP tools implemented and tested
✅ GDPR validation blocks Bug work items
✅ Server connects to Azure DevOps Server 7.1
✅ All tests passing (unit + integration)
✅ Documentation complete with examples
✅ No build errors or warnings
✅ Configuration validated on startup

### Validated Through:
- Unit tests for each service and utility
- Integration tests with mocked Azure DevOps API
- Manual testing against real Azure DevOps Server 7.1
- Claude/Copilot integration testing
- GDPR compliance verification

---

## Known Limitations

1. **Read-Only**: No write operations (by design)
2. **File Size**: Files limited to 1MB (configurable)
3. **Rate Limiting**: No built-in rate limit handling (future enhancement)
4. **Caching**: No caching layer (future enhancement)
5. **Single Project**: Server configured for one project at a time
6. **No Real-Time Updates**: No webhook support for change notifications

---

## Future Enhancement Opportunities

1. **Write Operations**: Add tools to create/update work items with user confirmation
2. **Advanced Search**: Filter work items by query, status, assignee, etc.
3. **Caching Layer**: Cache work item metadata to reduce API calls
4. **Multi-Project**: Support multiple projects in single server instance
5. **Webhooks**: Real-time notifications for work item changes
6. **Rate Limit Management**: Automatic backoff and retry with exponential delay
7. **Bulk Operations**: Fetch multiple work items in single request
8. **Analytics**: Usage metrics and performance monitoring

---

## Conclusion

This solution provides a secure, GDPR-compliant, read-only interface for AI code agents to access Azure DevOps work items, pull requests, and files. The layered architecture ensures maintainability and testability, while the MCP protocol provides standardization and broad AI agent compatibility.

The implementation prioritizes safety (read-only, GDPR validation) and reliability (error handling, validation) while providing comprehensive context (work item hierarchies, commits, file access) to enable AI agents to effectively assist with development tasks.
