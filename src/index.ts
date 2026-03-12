#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig, validateConfig } from './config.js';
import { AzureDevOpsClient } from './services/azureDevOpsClient.js';
import { GDPRValidator } from './utils/gdprValidator.js';

import { workItemTools, handleWorkItemToolCall } from './tools/workItemTools.js';
import { pullRequestTools, handlePullRequestToolCall } from './tools/pullRequestTools.js';
import { fileTools, handleFileToolCall } from './tools/fileTools.js';

const SERVER_NAME = 'azure-devops-mcp-server';
const SERVER_VERSION = '1.0.0';

class AzureDevOpsMCPServer {
  private server: Server;
  private allTools: any[];

  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.allTools = [...workItemTools, ...pullRequestTools, ...fileTools];

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('[MCP] Listing available tools...');
      return {
        tools: this.allTools,
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      console.error(`[MCP] Tool called: ${name}`);
      console.error(`[MCP] Arguments:`, JSON.stringify(args, null, 2));

      if (workItemTools.some(tool => tool.name === name)) {
        return await handleWorkItemToolCall(name, args);
      }

      if (pullRequestTools.some(tool => tool.name === name)) {
        return await handlePullRequestToolCall(name, args);
      }

      if (fileTools.some(tool => tool.name === name)) {
        return await handleFileToolCall(name, args);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP] Server error:', error);
    };

    process.on('SIGINT', async () => {
      console.error('[MCP] Shutting down server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('[MCP] Shutting down server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`[MCP] ${SERVER_NAME} v${SERVER_VERSION} started successfully`);
    console.error(`[MCP] Available tools: ${this.allTools.length}`);
  }
}

async function main(): Promise<void> {
  try {
    console.error('='.repeat(60));
    console.error(`Azure DevOps MCP Server v${SERVER_VERSION}`);
    console.error('='.repeat(60));

    console.error('[Init] Loading configuration...');
    const config = loadConfig();

    console.error('[Init] Validating configuration...');
    validateConfig(config);

    console.error('[Init] Initializing GDPR validator...');
    GDPRValidator.initialize(config.gdprBlockedWorkItemTypes);

    console.error('[Init] Connecting to Azure DevOps...');
    await AzureDevOpsClient.initialize(config);

    console.error('[Init] Starting MCP server...');
    const server = new AzureDevOpsMCPServer();
    await server.start();

    console.error('[Init] Server is ready to accept requests');
  } catch (error) {
    console.error('[Fatal] Failed to start server:', error);
    console.error('[Fatal] Error details:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
