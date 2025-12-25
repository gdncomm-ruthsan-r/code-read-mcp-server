#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
import * as Diff from "diff";

// Configuration - Update these with your details
interface ServiceConfig {
  name: string;
  repoOwner: string;
  repoName: string;
  automationRepoPath: string;
  apiPatterns: string[]; // File patterns to detect API changes
}

// Load configuration from environment or config file
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const DEFAULT_BASE_BRANCH = process.env.DEFAULT_BASE_BRANCH || "main";

// Service configurations - customize for your 7 services
const SERVICES: ServiceConfig[] = JSON.parse(
  process.env.SERVICES_CONFIG || "[]"
);

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// Tool input schemas
const GetApiChangesSchema = z.object({
  serviceName: z.string().describe("Name of the service to check for API changes"),
  baseBranch: z.string().optional().describe("Base branch to compare against (default: main)"),
  headBranch: z.string().optional().describe("Head branch or commit to compare (default: latest commit)"),
});

const GetApiDetailsSchema = z.object({
  serviceName: z.string().describe("Name of the service"),
  filePath: z.string().describe("Path to the API file to get details"),
  ref: z.string().optional().describe("Git ref (branch/commit) to read from"),
});

const ListServicesSchema = z.object({});

const GetTestTemplateSchema = z.object({
  serviceName: z.string().describe("Name of the service"),
  apiType: z.enum(["REST", "GraphQL", "gRPC"]).describe("Type of API"),
  httpMethod: z.string().optional().describe("HTTP method for REST APIs"),
});

const GetRecentCommitsSchema = z.object({
  serviceName: z.string().describe("Name of the service"),
  since: z.string().optional().describe("ISO date string to get commits since"),
  perPage: z.number().optional().describe("Number of commits to fetch (default: 10)"),
});

const GetPullRequestsSchema = z.object({
  serviceName: z.string().describe("Name of the service"),
  state: z.enum(["open", "closed", "all"]).optional().describe("PR state filter"),
});

const AnalyzeApiEndpointSchema = z.object({
  serviceName: z.string().describe("Name of the service"),
  filePath: z.string().describe("Path to the API file"),
  ref: z.string().optional().describe("Git ref to read from"),
});

// Helper functions
function getServiceConfig(serviceName: string): ServiceConfig | undefined {
  return SERVICES.find(
    (s) => s.name.toLowerCase() === serviceName.toLowerCase()
  );
}

async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref: ref || DEFAULT_BASE_BRANCH,
    });

    if ("content" in response.data) {
      return Buffer.from(response.data.content, "base64").toString("utf-8");
    }
    throw new Error("Not a file");
  } catch (error) {
    throw new Error(`Failed to fetch file: ${error}`);
  }
}

async function compareCommits(
  owner: string,
  repo: string,
  base: string,
  head: string
) {
  const response = await octokit.repos.compareCommits({
    owner,
    repo,
    base,
    head,
  });
  return response.data;
}

function detectApiChanges(
  files: Array<{ filename: string; status: string; patch?: string }>,
  apiPatterns: string[]
): Array<{
  filename: string;
  status: string;
  changes: string[];
  isApiFile: boolean;
}> {
  return files
    .filter((file) => {
      return apiPatterns.some((pattern) => {
        const regex = new RegExp(pattern.replace(/\*/g, ".*"));
        return regex.test(file.filename);
      });
    })
    .map((file) => {
      const changes: string[] = [];

      if (file.patch) {
        // Parse the patch to extract meaningful changes
        const lines = file.patch.split("\n");
        let currentEndpoint = "";

        for (const line of lines) {
          // Detect common API patterns
          const routePatterns = [
            /(@(Get|Post|Put|Delete|Patch|RequestMapping))/i, // Spring/Java
            /app\.(get|post|put|delete|patch)\s*\(/i, // Express.js
            /router\.(get|post|put|delete|patch)\s*\(/i, // Express Router
            /@(api_view|action)\s*\(/i, // Django/DRF
            /def\s+(get|post|put|delete|patch)\s*\(/i, // Python
            /func\s+\(.*\)\s+(Get|Post|Put|Delete|Patch)/i, // Go
            /\[Http(Get|Post|Put|Delete|Patch)\]/i, // ASP.NET
          ];

          for (const pattern of routePatterns) {
            if (pattern.test(line)) {
              changes.push(line.trim());
              break;
            }
          }
        }
      }

      return {
        filename: file.filename,
        status: file.status,
        changes,
        isApiFile: true,
      };
    });
}

function extractApiEndpoints(content: string, filename: string): Array<{
  method: string;
  path: string;
  handler: string;
  lineNumber: number;
}> {
  const endpoints: Array<{
    method: string;
    path: string;
    handler: string;
    lineNumber: number;
  }> = [];

  const lines = content.split("\n");

  // Common patterns for different frameworks
  const patterns = [
    // Express.js
    { regex: /(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi, methodIndex: 2, pathIndex: 3 },
    // Spring Boot
    { regex: /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)\s*\(\s*(?:value\s*=\s*)?['"`]?([^'"`\)]+)['"`]?/gi, methodIndex: 1, pathIndex: 2 },
    // FastAPI
    { regex: /@app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi, methodIndex: 1, pathIndex: 2 },
    // Django REST Framework
    { regex: /@action\s*\(\s*.*methods\s*=\s*\[\s*['"`](\w+)['"`]/gi, methodIndex: 1, pathIndex: null },
    // Go Gin
    { regex: /(GET|POST|PUT|DELETE|PATCH)\s*\(\s*['"`]([^'"`]+)['"`]/gi, methodIndex: 1, pathIndex: 2 },
  ];

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const matches = [...line.matchAll(pattern.regex)];
      for (const match of matches) {
        endpoints.push({
          method: match[pattern.methodIndex]?.toUpperCase() || "UNKNOWN",
          path: pattern.pathIndex ? match[pattern.pathIndex] : "",
          handler: line.trim(),
          lineNumber: index + 1,
        });
      }
    }
  });

  return endpoints;
}

// Create MCP Server
const server = new Server(
  {
    name: "api-test-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_services",
        description: "List all configured services and their automation repo paths",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_api_changes",
        description: "Get API changes between two branches or commits for a service. Detects new/modified API endpoints.",
        inputSchema: {
          type: "object",
          properties: {
            serviceName: {
              type: "string",
              description: "Name of the service to check for API changes",
            },
            baseBranch: {
              type: "string",
              description: "Base branch to compare against (default: main)",
            },
            headBranch: {
              type: "string",
              description: "Head branch or commit to compare",
            },
          },
          required: ["serviceName"],
        },
      },
      {
        name: "get_api_details",
        description: "Get the full content of an API file for detailed analysis",
        inputSchema: {
          type: "object",
          properties: {
            serviceName: {
              type: "string",
              description: "Name of the service",
            },
            filePath: {
              type: "string",
              description: "Path to the API file",
            },
            ref: {
              type: "string",
              description: "Git ref (branch/commit) to read from",
            },
          },
          required: ["serviceName", "filePath"],
        },
      },
      {
        name: "get_recent_commits",
        description: "Get recent commits for a service to identify recent changes",
        inputSchema: {
          type: "object",
          properties: {
            serviceName: {
              type: "string",
              description: "Name of the service",
            },
            since: {
              type: "string",
              description: "ISO date string to get commits since",
            },
            perPage: {
              type: "number",
              description: "Number of commits to fetch (default: 10)",
            },
          },
          required: ["serviceName"],
        },
      },
      {
        name: "get_pull_requests",
        description: "Get pull requests for a service to find API changes in PRs",
        inputSchema: {
          type: "object",
          properties: {
            serviceName: {
              type: "string",
              description: "Name of the service",
            },
            state: {
              type: "string",
              enum: ["open", "closed", "all"],
              description: "PR state filter",
            },
          },
          required: ["serviceName"],
        },
      },
      {
        name: "analyze_api_endpoint",
        description: "Analyze an API file and extract all endpoint definitions with their methods, paths, and handlers",
        inputSchema: {
          type: "object",
          properties: {
            serviceName: {
              type: "string",
              description: "Name of the service",
            },
            filePath: {
              type: "string",
              description: "Path to the API file",
            },
            ref: {
              type: "string",
              description: "Git ref to read from",
            },
          },
          required: ["serviceName", "filePath"],
        },
      },
      {
        name: "get_test_template",
        description: "Get a test template based on API type and service",
        inputSchema: {
          type: "object",
          properties: {
            serviceName: {
              type: "string",
              description: "Name of the service",
            },
            apiType: {
              type: "string",
              enum: ["REST", "GraphQL", "gRPC"],
              description: "Type of API",
            },
            httpMethod: {
              type: "string",
              description: "HTTP method for REST APIs",
            },
          },
          required: ["serviceName", "apiType"],
        },
      },
      {
        name: "compare_branches",
        description: "Compare two branches and get a summary of all changes including API-related files",
        inputSchema: {
          type: "object",
          properties: {
            serviceName: {
              type: "string",
              description: "Name of the service",
            },
            baseBranch: {
              type: "string",
              description: "Base branch (default: main)",
            },
            headBranch: {
              type: "string",
              description: "Head branch to compare",
            },
          },
          required: ["serviceName", "headBranch"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_services": {
        if (SERVICES.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: "No services configured",
                    help: "Set SERVICES_CONFIG environment variable with your service configurations",
                    example: [
                      {
                        name: "user-service",
                        repoOwner: "your-org",
                        repoName: "user-service",
                        automationRepoPath: "/path/to/automation/user-service",
                        apiPatterns: ["**/controllers/**", "**/routes/**"],
                      },
                    ],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  services: SERVICES.map((s) => ({
                    name: s.name,
                    repo: `${s.repoOwner}/${s.repoName}`,
                    automationPath: s.automationRepoPath,
                    apiPatterns: s.apiPatterns,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_api_changes": {
        const parsed = GetApiChangesSchema.parse(args);
        const service = getServiceConfig(parsed.serviceName);

        if (!service) {
          return {
            content: [
              {
                type: "text",
                text: `Service "${parsed.serviceName}" not found. Available services: ${SERVICES.map((s) => s.name).join(", ")}`,
              },
            ],
          };
        }

        const base = parsed.baseBranch || DEFAULT_BASE_BRANCH;
        const head = parsed.headBranch || DEFAULT_BASE_BRANCH;

        const comparison = await compareCommits(
          service.repoOwner,
          service.repoName,
          base,
          head
        );

        const apiChanges = detectApiChanges(
          comparison.files || [],
          service.apiPatterns
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  service: service.name,
                  comparison: {
                    base,
                    head,
                    aheadBy: comparison.ahead_by,
                    behindBy: comparison.behind_by,
                    totalCommits: comparison.total_commits,
                  },
                  apiChanges,
                  allChangedFiles: comparison.files?.map((f) => ({
                    filename: f.filename,
                    status: f.status,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_api_details": {
        const parsed = GetApiDetailsSchema.parse(args);
        const service = getServiceConfig(parsed.serviceName);

        if (!service) {
          return {
            content: [
              {
                type: "text",
                text: `Service "${parsed.serviceName}" not found.`,
              },
            ],
          };
        }

        const content = await getFileContent(
          service.repoOwner,
          service.repoName,
          parsed.filePath,
          parsed.ref
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  service: service.name,
                  filePath: parsed.filePath,
                  ref: parsed.ref || DEFAULT_BASE_BRANCH,
                  content,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_recent_commits": {
        const parsed = GetRecentCommitsSchema.parse(args);
        const service = getServiceConfig(parsed.serviceName);

        if (!service) {
          return {
            content: [
              {
                type: "text",
                text: `Service "${parsed.serviceName}" not found.`,
              },
            ],
          };
        }

        const commits = await octokit.repos.listCommits({
          owner: service.repoOwner,
          repo: service.repoName,
          since: parsed.since,
          per_page: parsed.perPage || 10,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  service: service.name,
                  commits: commits.data.map((c) => ({
                    sha: c.sha,
                    message: c.commit.message,
                    author: c.commit.author?.name,
                    date: c.commit.author?.date,
                    url: c.html_url,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_pull_requests": {
        const parsed = GetPullRequestsSchema.parse(args);
        const service = getServiceConfig(parsed.serviceName);

        if (!service) {
          return {
            content: [
              {
                type: "text",
                text: `Service "${parsed.serviceName}" not found.`,
              },
            ],
          };
        }

        const prs = await octokit.pulls.list({
          owner: service.repoOwner,
          repo: service.repoName,
          state: parsed.state || "open",
          per_page: 20,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  service: service.name,
                  pullRequests: prs.data.map((pr) => ({
                    number: pr.number,
                    title: pr.title,
                    state: pr.state,
                    author: pr.user?.login,
                    createdAt: pr.created_at,
                    headBranch: pr.head.ref,
                    baseBranch: pr.base.ref,
                    url: pr.html_url,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "analyze_api_endpoint": {
        const parsed = AnalyzeApiEndpointSchema.parse(args);
        const service = getServiceConfig(parsed.serviceName);

        if (!service) {
          return {
            content: [
              {
                type: "text",
                text: `Service "${parsed.serviceName}" not found.`,
              },
            ],
          };
        }

        const content = await getFileContent(
          service.repoOwner,
          service.repoName,
          parsed.filePath,
          parsed.ref
        );

        const endpoints = extractApiEndpoints(content, parsed.filePath);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  service: service.name,
                  filePath: parsed.filePath,
                  endpoints,
                  totalEndpoints: endpoints.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_test_template": {
        const parsed = GetTestTemplateSchema.parse(args);
        const service = getServiceConfig(parsed.serviceName);

        let template = "";
        const automationPath = service?.automationRepoPath || "/path/to/automation";

        if (parsed.apiType === "REST") {
          template = `
// Test file location: ${automationPath}/tests/api/
// Generated test template for ${parsed.serviceName} - ${parsed.httpMethod || "HTTP"} endpoint

import { test, expect } from '@playwright/test';
import { APIRequestContext } from '@playwright/test';

test.describe('${parsed.serviceName} API Tests', () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL,
      extraHTTPHeaders: {
        'Authorization': \`Bearer \${process.env.API_TOKEN}\`,
        'Content-Type': 'application/json',
      },
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('${parsed.httpMethod || "GET"} /endpoint - should return success', async () => {
    const response = await apiContext.${(parsed.httpMethod || "get").toLowerCase()}('/api/v1/endpoint');
    
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    // Add assertions based on expected response structure
    expect(body).toHaveProperty('data');
  });

  test('${parsed.httpMethod || "GET"} /endpoint - should handle invalid request', async () => {
    const response = await apiContext.${(parsed.httpMethod || "get").toLowerCase()}('/api/v1/endpoint/invalid');
    
    expect(response.status()).toBe(404);
  });

  test('${parsed.httpMethod || "GET"} /endpoint - should require authentication', async () => {
    const unauthContext = await apiContext.newContext({
      baseURL: process.env.API_BASE_URL,
    });
    
    const response = await unauthContext.${(parsed.httpMethod || "get").toLowerCase()}('/api/v1/endpoint');
    expect(response.status()).toBe(401);
  });
});
`;
        } else if (parsed.apiType === "GraphQL") {
          template = `
// Test file location: ${automationPath}/tests/graphql/
// Generated test template for ${parsed.serviceName} - GraphQL endpoint

import { test, expect } from '@playwright/test';

test.describe('${parsed.serviceName} GraphQL Tests', () => {
  const graphqlEndpoint = process.env.GRAPHQL_ENDPOINT || '/graphql';

  test('Query - should fetch data successfully', async ({ request }) => {
    const response = await request.post(graphqlEndpoint, {
      data: {
        query: \`
          query GetData {
            data {
              id
              name
            }
          }
        \`,
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data).toBeDefined();
  });

  test('Mutation - should create data successfully', async ({ request }) => {
    const response = await request.post(graphqlEndpoint, {
      data: {
        query: \`
          mutation CreateData($input: DataInput!) {
            createData(input: $input) {
              id
              name
            }
          }
        \`,
        variables: {
          input: {
            name: 'Test Data',
          },
        },
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.errors).toBeUndefined();
  });
});
`;
        } else if (parsed.apiType === "gRPC") {
          template = `
// Test file location: ${automationPath}/tests/grpc/
// Generated test template for ${parsed.serviceName} - gRPC endpoint

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { expect } from 'chai';

describe('${parsed.serviceName} gRPC Tests', () => {
  let client: any;

  before(() => {
    const packageDefinition = protoLoader.loadSync('path/to/service.proto');
    const proto = grpc.loadPackageDefinition(packageDefinition);
    
    client = new (proto as any).ServiceName(
      process.env.GRPC_ENDPOINT || 'localhost:50051',
      grpc.credentials.createInsecure()
    );
  });

  after(() => {
    client.close();
  });

  it('should call RPC method successfully', (done) => {
    client.methodName({ field: 'value' }, (err: Error | null, response: any) => {
      expect(err).to.be.null;
      expect(response).to.have.property('result');
      done();
    });
  });

  it('should handle errors gracefully', (done) => {
    client.methodName({ invalidField: 'value' }, (err: Error | null, response: any) => {
      expect(err).to.not.be.null;
      done();
    });
  });
});
`;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  service: parsed.serviceName,
                  apiType: parsed.apiType,
                  httpMethod: parsed.httpMethod,
                  template,
                  automationRepoPath: automationPath,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "compare_branches": {
        const schema = z.object({
          serviceName: z.string(),
          baseBranch: z.string().optional(),
          headBranch: z.string(),
        });
        const parsed = schema.parse(args);
        const service = getServiceConfig(parsed.serviceName);

        if (!service) {
          return {
            content: [
              {
                type: "text",
                text: `Service "${parsed.serviceName}" not found.`,
              },
            ],
          };
        }

        const base = parsed.baseBranch || DEFAULT_BASE_BRANCH;
        const comparison = await compareCommits(
          service.repoOwner,
          service.repoName,
          base,
          parsed.headBranch
        );

        const apiFiles = comparison.files?.filter((f) =>
          service.apiPatterns.some((pattern) => {
            const regex = new RegExp(pattern.replace(/\*/g, ".*"));
            return regex.test(f.filename);
          })
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  service: service.name,
                  comparison: {
                    base,
                    head: parsed.headBranch,
                    status: comparison.status,
                    aheadBy: comparison.ahead_by,
                    behindBy: comparison.behind_by,
                    totalCommits: comparison.total_commits,
                  },
                  summary: {
                    totalFilesChanged: comparison.files?.length || 0,
                    apiFilesChanged: apiFiles?.length || 0,
                  },
                  apiFiles: apiFiles?.map((f) => ({
                    filename: f.filename,
                    status: f.status,
                    additions: f.additions,
                    deletions: f.deletions,
                  })),
                  commits: comparison.commits.map((c) => ({
                    sha: c.sha.substring(0, 7),
                    message: c.commit.message.split("\n")[0],
                    author: c.commit.author?.name,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

// List resources (your automation repos)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: SERVICES.map((service) => ({
      uri: `automation://${service.name}`,
      name: `${service.name} Automation Repo`,
      description: `Automation repository for ${service.name} at ${service.automationRepoPath}`,
      mimeType: "text/plain",
    })),
  };
});

// Read resource
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const serviceName = uri.replace("automation://", "");
  const service = getServiceConfig(serviceName);

  if (!service) {
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `Service "${serviceName}" not found`,
        },
      ],
    };
  }

  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text: JSON.stringify(
          {
            name: service.name,
            repo: `${service.repoOwner}/${service.repoName}`,
            automationPath: service.automationRepoPath,
            apiPatterns: service.apiPatterns,
          },
          null,
          2
        ),
      },
    ],
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("API Test MCP Server started");
}

main().catch(console.error);


