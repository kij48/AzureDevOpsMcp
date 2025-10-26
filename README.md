# Azure DevOps MCP Server

A **Model Context Protocol (MCP)** server for **Azure DevOps Server 7.1** that provides read-only access to work items, pull requests, and repository files for AI code agents like Claude and GitHub Copilot. Features GDPR-compliant work item filtering to protect sensitive data.

## Features

- **Work Item Access**: Retrieve work items, hierarchies, and associated commits
- **Pull Request Integration**: Access PR details, changes, and commits
- **File Retrieval**: Get file content from repositories and PR branches
- **GDPR Compliance**: Configurable blocking of work item types containing personal data
- **Read-Only**: Safe operations with no write capabilities
- **Self-Hosted Support**: Designed for Azure DevOps Server 7.1 (on-premises)

## Prerequisites

- **Node.js** 18.x or higher
- **Azure DevOps Server 7.1** or Azure DevOps Services
- **Personal Access Token (PAT)** with appropriate permissions

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd DevOpsMcp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Azure DevOps details:
   ```env
   AZURE_DEVOPS_URL=https://your-devops-server.com
   AZURE_DEVOPS_PAT=your_personal_access_token
   AZURE_DEVOPS_ORGANIZATION=YourOrganization
   AZURE_DEVOPS_PROJECT=YourProject
   GDPR_BLOCKED_WORK_ITEM_TYPES=Bug
   MAX_FILE_SIZE_MB=1
   ```

4. **Build the project**:
   ```bash
   npm run build
   ```

## Personal Access Token (PAT) Setup

### For Azure DevOps Server 7.1:

1. Navigate to your Azure DevOps Server profile
2. Go to **Security** → **Personal Access Tokens**
3. Click **New Token**
4. Configure the token with these scopes:
   - **Code**: Read
   - **Work Items**: Read
   - **Pull Requests**: Read
5. Copy the generated token to your `.env` file

### Required Permissions:

- `vso.code` (Read)
- `vso.work` (Read)
- `vso.code_status` (Read)

## Usage

### Start the MCP Server

#### Development Mode:
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

The server will:
1. Load configuration from `.env`
2. Initialize GDPR validator
3. Connect to Azure DevOps
4. Start listening for MCP requests via stdio

### Integration with Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "node",
      "args": ["/path/to/DevOpsMcp/dist/index.js"],
      "env": {
        "AZURE_DEVOPS_URL": "https://your-server.com",
        "AZURE_DEVOPS_PAT": "your_pat_here",
        "AZURE_DEVOPS_ORGANIZATION": "YourOrg",
        "AZURE_DEVOPS_PROJECT": "YourProject"
      }
    }
  }
}
```

## Available Tools

### Work Item Tools

#### `get_work_item`
Retrieves detailed information about a work item.

**Input:**
```json
{
  "workItemId": 12345
}
```

**Output:**
```json
{
  "id": 12345,
  "title": "Feature Title",
  "description": "Feature description",
  "workItemType": "Feature",
  "state": "Active",
  "assignedTo": "John Doe",
  "createdDate": "2024-01-01T00:00:00Z",
  "changedDate": "2024-01-15T00:00:00Z",
  "areaPath": "Project\\Area",
  "iterationPath": "Project\\Sprint 1",
  "tags": ["tag1", "tag2"],
  "fields": { ... }
}
```

#### `get_work_item_children`
Retrieves all child work items recursively.

**Input:**
```json
{
  "workItemId": 12345,
  "maxDepth": 5
}
```

#### `get_work_item_commits`
Gets all commits linked to a work item (direct + PR commits).

**Input:**
```json
{
  "workItemId": 12345
}
```

#### `get_work_item_tree`
Retrieves hierarchical tree structure of work items.

**Input:**
```json
{
  "workItemId": 12345,
  "maxDepth": 5
}
```

### Pull Request Tools

**Repository ID Format:**

The `repositoryId` parameter accepts three formats:
1. **Simple name**: `"MyRepository"` - automatically prefixed with the configured project name
2. **Full path**: `"ProjectName/MyRepository"` - explicit project and repository
3. **GUID**: `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"` - repository GUID

**Recommended**: Use simple repository names (e.g., `"MyRepository"`). The server automatically prefixes them with your configured project name.

#### `get_pull_request`
Retrieves pull request details.

**Input:**
```json
{
  "repositoryId": "MyRepository",
  "pullRequestId": 123
}
```

**Example with explicit project:**
```json
{
  "repositoryId": "MyProject/MyRepository",
  "pullRequestId": 123
}
```

#### `get_pull_request_changes`
Gets file changes in a pull request.

**Input:**
```json
{
  "repositoryId": "MyRepository",
  "pullRequestId": 123
}
```

#### `get_pull_request_commits`
Retrieves all commits in a pull request.

**Input:**
```json
{
  "repositoryId": "MyRepository",
  "pullRequestId": 123
}
```

### File Tools

**Note**: File tools use the same repository ID format as pull request tools (simple name, full path, or GUID).

#### `get_file_content`
Retrieves file content from a repository branch.

**Input:**
```json
{
  "repositoryId": "MyRepository",
  "filePath": "/src/index.ts",
  "branch": "main"
}
```

#### `get_file_from_pr`
Gets file content from a pull request branch.

**Input:**
```json
{
  "repositoryId": "MyRepository",
  "pullRequestId": 123,
  "filePath": "/src/index.ts"
}
```

## GDPR Compliance

The server enforces GDPR compliance by blocking access to work item types that may contain personal data (e.g., customer names, emails).

### Default Blocked Types:
- `Bug` (often contains customer information)

### Configuration:

Customize blocked types via environment variable:

```env
GDPR_BLOCKED_WORK_ITEM_TYPES=Bug,Issue,Incident
```

### Behavior:

When attempting to access a blocked work item type:

```json
{
  "error": "Access to work item #12345 of type 'Bug' is blocked by GDPR policy. This work item type may contain personal data and cannot be accessed through this API."
}
```

All GDPR checks are logged for audit purposes.

## Configuration Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_DEVOPS_URL` | Yes | - | Azure DevOps Server URL |
| `AZURE_DEVOPS_PAT` | Yes | - | Personal Access Token |
| `AZURE_DEVOPS_ORGANIZATION` | Yes | - | Organization name |
| `AZURE_DEVOPS_PROJECT` | Yes | - | Project name |
| `GDPR_BLOCKED_WORK_ITEM_TYPES` | No | `Bug` | Comma-separated list of blocked types |
| `MAX_FILE_SIZE_MB` | No | `1` | Maximum file size for retrieval (MB) |

## Architecture

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

## Troubleshooting

### Authentication Errors

**Error**: `Failed to connect to Azure DevOps`

**Solutions**:
- Verify PAT is valid and not expired
- Check PAT has correct scopes (Code: Read, Work Items: Read)
- Confirm `AZURE_DEVOPS_URL` is correct
- Test connection manually: `curl -u :PAT https://your-server.com/_apis/projects`

### GDPR Blocked Access

**Error**: `Access to work item #123 of type 'Bug' is blocked by GDPR policy`

**Solutions**:
- This is expected behavior for Bug work items
- To access, remove `Bug` from `GDPR_BLOCKED_WORK_ITEM_TYPES`
- Ensure compliance with data privacy regulations before changing

### File Size Limit Exceeded

**Error**: `File "path" size exceeds the maximum allowed size`

**Solutions**:
- Increase `MAX_FILE_SIZE_MB` in `.env`
- Use Git client for very large files
- Consider file size implications on memory

### Connection Validation Failed

**Error**: `Connection validation failed`

**Solutions**:
- Verify organization and project names are correct
- Check network connectivity to Azure DevOps Server
- Confirm server URL is accessible
- Review firewall/proxy settings

### Pull Request or Repository Not Found

**Error**: `Pull request #123 not found` or `Repository requires project name`

**Solutions**:
- Use simple repository name (e.g., `"MyRepository"`) - project is added automatically
- Or use full path format: `"ProjectName/MyRepository"`
- Or use repository GUID if you have it
- Verify the repository name matches exactly (case-sensitive)
- Confirm the pull request ID exists in that repository
- Check that your PAT has access to the repository

**Example Fix:**
```json
// Instead of this (may fail):
{"repositoryId": "repo123", "pullRequestId": 67277}

// Try this (recommended):
{"repositoryId": "MyRepository", "pullRequestId": 67277}

// Or this (explicit):
{"repositoryId": "MyProject/MyRepository", "pullRequestId": 67277}
```

## Development

### Project Structure

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

### Build Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Run in development mode with tsx
- `npm run watch` - Watch mode for development
- `npm start` - Run production build

## Limitations

1. **Read-Only**: No write operations (create, update, delete)
2. **File Size**: Limited to configured max size (default 1MB)
3. **Single Project**: Configured for one project per server instance
4. **No Caching**: Each request fetches fresh data from Azure DevOps
5. **No Real-Time Updates**: No webhook support for change notifications

## Future Enhancements

- Write operations with user confirmation
- Advanced work item search and filtering
- Caching layer for improved performance
- Multi-project support
- Webhook notifications
- Rate limit management
- Bulk operations

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns
- GDPR compliance is maintained
- Error handling is comprehensive
- Documentation is updated

## Support

For issues, questions, or contributions, please open an issue on the repository.

---

**Built with**: Node.js, TypeScript, Azure DevOps Node API, MCP SDK

**Version**: 1.0.0
