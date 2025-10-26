# Azure DevOps MCP Server

A Model Context Protocol (MCP) server that connects Claude Desktop and VS Code to Azure DevOps, enabling AI-assisted access to work items, pull requests, and repository files.

## What This Does

- Access Azure DevOps work items, PRs, and files directly from Claude or VS Code
- Read-only operations (safe for production environments)
- GDPR-compliant filtering to protect sensitive data
- Works with both cloud Azure DevOps and self-hosted servers

## Prerequisites

- Node.js 18.x or higher
- Azure DevOps account (cloud or self-hosted)
- Claude Desktop or VS Code with Continue extension

## Quick Setup

### Step 1: Clone and Install

```bash
git clone <repository-url>
cd DevOpsMcp
npm install
```

### Step 2: Create Azure DevOps Personal Access Token (PAT)

1. Go to your Azure DevOps organization
2. Click your profile icon → **Personal Access Tokens**
3. Click **+ New Token**
4. Configure the token:
   - **Name**: MCP Server Token
   - **Scopes**:
     - ✓ **Code** (Read) - _for repositories, files, and pull requests_
     - ✓ **Work Items** (Read) - _for work items and their relationships_
5. Click **Create** and copy the token (you won't see it again!)

### Step 3: Build the Project

```bash
npm run build
```

## Step 4: Configure MCP Client

### For Claude Desktop

1. Find your Claude Desktop config file:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Add this configuration (replace with your actual values):

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "node",
      "args": ["C:/repos/DevOpsMcp/dist/index.js"],
      "env": {
        "AZURE_DEVOPS_URL": "https://dev.azure.com/YourOrganization",
        "AZURE_DEVOPS_PAT": "your_pat_from_step_2",
        "AZURE_DEVOPS_PROJECT": "YourProjectName",
        "GDPR_BLOCKED_WORK_ITEM_TYPES": "Bug",
        "MAX_FILE_SIZE_MB": "1"
      }
    }
  }
}
```

**Important:**
- Replace `C:/repos/DevOpsMcp/dist/index.js` with the absolute path to your installation
- Replace `YourOrganization` with your Azure DevOps organization name
- Replace `your_pat_from_step_2` with the PAT you created in Step 2
- Replace `YourProjectName` with your Azure DevOps project name
- Optional settings (`GDPR_BLOCKED_WORK_ITEM_TYPES`, `MAX_FILE_SIZE_MB`) can be omitted for defaults

3. Restart Claude Desktop

### For VS Code (with Continue extension)

1. Open VS Code settings for Continue extension
2. Add MCP server configuration similar to Claude Desktop
3. Restart VS Code

## Verify It's Working

After restarting Claude Desktop:

1. Start a new conversation
2. Look for the "🔌" icon or MCP tools indicator
3. Try asking: "What work item types are available in our Azure DevOps project?"
4. Claude should now have access to your Azure DevOps data!

## Available Tools

Once configured, you can ask Claude to:

### Work Items
- "Get details for work item #12345"
- "Show me the child tasks for epic #100"
- "What commits are linked to work item #500?"

### Pull Requests
- "Get pull request #123 from the MyRepo repository"
- "Show me the file changes in PR #456"
- "List all commits in pull request #789"

### Files
- "Get the content of /src/index.ts from the main branch"
- "Show me the file /README.md from pull request #123"

## Troubleshooting

### "Connection failed" or "Authentication error"

- Verify your PAT is correct and not expired
- Check that your PAT has Code (Read) and Work Items (Read) scopes
- Confirm `AZURE_DEVOPS_URL` matches your organization URL
- Test manually: `curl -u :YOUR_PAT https://dev.azure.com/YourOrg/_apis/projects`

### "Work item blocked by GDPR policy"

- Bug work items are blocked by default to protect customer data
- To access bugs, remove `GDPR_BLOCKED_WORK_ITEM_TYPES` from your MCP configuration or set it to an empty string
- Ensure you comply with your organization's data privacy policies

### "Pull request not found"

- Use simple repository name: `"MyRepository"` (project is added automatically)
- Or use full path: `"ProjectName/MyRepository"`
- Verify the repository and PR number are correct

### MCP server not appearing in Claude

- Check that the path to `dist/index.js` is absolute and correct
- Verify `npm run build` completed successfully
- Restart Claude Desktop completely
- Check Claude Desktop logs for errors

## Configuration Reference

These environment variables are set in your MCP client configuration (Claude Desktop config or VS Code settings):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_DEVOPS_URL` | Yes | - | Your Azure DevOps URL |
| `AZURE_DEVOPS_PAT` | Yes | - | Personal Access Token |
| `AZURE_DEVOPS_PROJECT` | Yes | - | Project name |
| `GDPR_BLOCKED_WORK_ITEM_TYPES` | No | `Bug` | Work item types to block |
| `MAX_FILE_SIZE_MB` | No | `1` | Max file size for retrieval |

## Security Notes

- This server is **read-only** - it cannot modify Azure DevOps data
- Your PAT is stored in your MCP client configuration and never transmitted except to Azure DevOps
- GDPR compliance blocks access to work item types that may contain personal data
- Keep your PAT secure and protect your MCP configuration file

## License

MIT

## Support

For issues or questions, please open an issue on the repository.
