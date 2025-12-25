# Code Reader MCP Server

An MCP (Model Context Protocol) server that connects to your GitHub repositories, detects API changes, and provides context for Cursor to automatically generate test cases.

## Features

- 🔍 **Detect API Changes**: Compare branches/commits to find new or modified API endpoints
- 📂 **Multi-Service Support**: Configure all 7 of your services with their automation repos
- 🔗 **GitHub Integration**: Fetch file contents, commits, PRs directly from GitHub
- 📝 **Test Templates**: Get starter templates for REST, GraphQL, and gRPC APIs
- 🤖 **Cursor Integration**: Provides tools that Cursor can use to understand your API changes

## Prerequisites

- Node.js 18+ 
- npm or yarn
- GitHub Personal Access Token with `repo` scope
- Cursor IDE

## Quick Start

### 1. Install Dependencies

```bash
cd ~/api-test-mcp-server
npm install
```

### 2. Build the Server

```bash
npm run build
```

### 3. Configure Your Services

Create a `config.json` file based on the example:

```bash
cp config.example.json config.json
```

Edit `config.json` with your actual service details:

```json
{
  "services": [
    {
      "name": "user-service",
      "repoOwner": "your-github-org",
      "repoName": "user-service-repo",
      "automationRepoPath": "/Users/ruthsan/automation-repos/user-service",
      "apiPatterns": [
        "**/controllers/**",
        "**/routes/**",
        "**/api/**"
      ]
    }
    // ... add all 7 services
  ]
}
```

### 4. Set Up GitHub Token

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your GitHub token:

```
GITHUB_TOKEN=ghp_your_actual_token_here
DEFAULT_BASE_BRANCH=main
```

**Getting a GitHub Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (for private repos) or `public_repo` (for public repos only)
4. Copy the generated token

### 5. Configure Cursor MCP

Open Cursor and go to: **Settings → Features → MCP Servers**

Or manually edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "api-test-server": {
      "command": "node",
      "args": ["/Users/ruthsan/api-test-mcp-server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here",
        "DEFAULT_BASE_BRANCH": "main",
        "SERVICES_CONFIG": "[{\"name\":\"user-service\",\"repoOwner\":\"your-org\",\"repoName\":\"user-service\",\"automationRepoPath\":\"/path/to/automation\",\"apiPatterns\":[\"**/controllers/**\",\"**/routes/**\"]}]"
      }
    }
  }
}
```

### 6. Restart Cursor

After configuring, restart Cursor for the MCP server to be loaded.

## Available Tools

Once configured, you can ask Cursor to use these tools:

| Tool | Description |
|------|-------------|
| `list_services` | List all configured services |
| `get_api_changes` | Get API changes between branches |
| `get_api_details` | Get full content of an API file |
| `get_recent_commits` | Get recent commits for a service |
| `get_pull_requests` | Get PRs for a service |
| `analyze_api_endpoint` | Extract endpoint definitions from a file |
| `get_test_template` | Get a test template for REST/GraphQL/gRPC |
| `compare_branches` | Compare branches and summarize changes |

## Usage Examples

### Example 1: Find API Changes and Generate Tests

In Cursor, open your automation repo and ask:

```
Using the api-test-server, find all API changes in the user-service 
between main and feature/new-user-endpoints branch. 
Then generate test cases for each new endpoint.
```

### Example 2: Analyze a Specific API File

```
Use the MCP server to analyze the API endpoints in 
src/controllers/UserController.ts in the user-service. 
Generate comprehensive test cases for each endpoint.
```

### Example 3: Check Recent Changes

```
Show me the recent commits in order-service that might have API changes. 
Then fetch the details of any modified API files.
```

### Example 4: Generate Tests from PR

```
List the open PRs in payment-service. For the latest PR, 
analyze the API changes and generate test cases.
```

## Workflow for Automated Test Generation

1. **Detect Changes**: Use `get_api_changes` or `compare_branches` to find new APIs
2. **Analyze Endpoints**: Use `analyze_api_endpoint` to understand the API structure
3. **Get Full Context**: Use `get_api_details` to read the complete API implementation
4. **Generate Tests**: Cursor uses this context to write comprehensive test cases
5. **Save to Automation Repo**: Tests are saved to your local automation repository

## Configuration Options

### API Patterns

Configure `apiPatterns` to match your codebase structure:

**For Spring Boot (Java):**
```json
"apiPatterns": [
  "**/controller/**",
  "**/rest/**",
  "**/*Controller.java",
  "**/*Resource.java"
]
```

**For Express.js (Node.js):**
```json
"apiPatterns": [
  "**/routes/**",
  "**/api/**",
  "**/*.routes.ts",
  "**/*.controller.ts"
]
```

**For FastAPI (Python):**
```json
"apiPatterns": [
  "**/routers/**",
  "**/api/**",
  "**/*_router.py",
  "**/*_api.py"
]
```

**For Go:**
```json
"apiPatterns": [
  "**/handlers/**",
  "**/api/**",
  "**/*_handler.go",
  "**/routes.go"
]
```

## Troubleshooting

### MCP Server not appearing in Cursor

1. Check if the server builds correctly: `npm run build`
2. Verify the path in `mcp.json` is absolute
3. Check Cursor logs: **Help → Toggle Developer Tools → Console**

### GitHub API Errors

1. Verify your GitHub token is valid
2. Check token has the required scopes (`repo` or `public_repo`)
3. Ensure the repository names are correct

### No API Changes Detected

1. Verify `apiPatterns` match your file structure
2. Check if the branches/commits you're comparing exist
3. Try broader patterns like `**/*.ts` for testing

## Development

### Run in Development Mode

```bash
npm run dev
```

### Watch for Changes

```bash
npm run watch
```

## License

MIT


