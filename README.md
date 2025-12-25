# Code Reader - MCP Server

An MCP (Model Context Protocol) server that connects to your GitHub repositories, detects API changes, and provides context for Cursor to automatically generate test cases.

## Features

- 🔍 **Detect API Changes**: Compare branches/commits to find new or modified API endpoints
- 📂 **Multi-Service Support**: Configure multiple services with their automation repos
- 🔗 **GitHub Integration**: Fetch file contents, commits, PRs directly from GitHub
- 📝 **Test Templates**: Get starter templates for REST, GraphQL, and gRPC APIs
- 🤖 **Cursor Integration**: Provides tools that Cursor can use to understand your API changes

## Configured Services

This MCP server is configured for the following Bliklan services:

| Service                     | Repository                          |
| --------------------------- | ----------------------------------- |
| bliklan-campaign-management | gdncomm/bliklan-campaign-management |
| bliklan-tracker-aggregator  | gdncomm/bliklan-tracker-aggregator  |
| bliklan-compute-engine      | gdncomm/bliklan-compute-engine      |
| bliklan-credit              | gdncomm/bliklan-credit              |
| bliklan-ads-engine          | gdncomm/bliklan-ads-engine          |

---

## Prerequisites

- **Node.js 18+** (we recommend using nvm)
- **npm** (comes with Node.js)
- **GitHub Fine-Grained Personal Access Token** (required for gdncomm org)
- **Cursor IDE**

### Check Your Node.js Version

```bash
node --version
# Should be v18.x.x or higher (v20.x or v21.x recommended)
```

If you're using an older version, install a newer one via nvm:

```bash
nvm install 21
nvm use 21
nvm alias default 21
```

---

## Quick Start

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd api-test-mcp-server
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Build the Server

```bash
npm run build
```

This creates the `dist/index.js` file that Cursor will run.

### Step 4: Create a GitHub Fine-Grained Token

⚠️ **Important**: The `gdncomm` organization requires a **fine-grained personal access token** (classic tokens won't work).

1. Go to: https://github.com/settings/tokens?type=beta
2. Click **"Generate new token"**
3. Configure:
   - **Token name**: `api-test-mcp-server`
   - **Expiration**: Choose appropriate duration
   - **Resource owner**: Select `gdncomm` organization
   - **Repository access**: Select "Only select repositories" → choose the repos you need
   - **Permissions** (Repository permissions):
     - **Contents**: Read-only
     - **Metadata**: Read-only
     - **Pull requests**: Read-only
     - **Commit statuses**: Read-only
4. Click **Generate token**
5. Copy the token (starts with `github_pat_`)

### Step 5: Configure Cursor MCP

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "api-test-server": {
      "command": "/path/to/your/node",
      "args": ["/path/to/api-test-mcp-server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "github_pat_your_token_here",
        "DEFAULT_BASE_BRANCH": "master",
        "SERVICES_CONFIG": "[{\"name\":\"bliklan-campaign-management\",\"repoOwner\":\"gdncomm\",\"repoName\":\"bliklan-campaign-management\",\"automationRepoPath\":\"/Users/yourname/automation-repos/bliklan-campaign-management\",\"apiPatterns\":[\"**/controllers/**\",\"**/routes/**\",\"**/api/**\",\"**/*Controller*\",\"**/*Router*\"]},{\"name\":\"bliklan-tracker-aggregator\",\"repoOwner\":\"gdncomm\",\"repoName\":\"bliklan-tracker-aggregator\",\"automationRepoPath\":\"/Users/yourname/automation-repos/bliklan-tracker-aggregator\",\"apiPatterns\":[\"**/controllers/**\",\"**/routes/**\",\"**/api/**\",\"**/*Controller*\",\"**/*Router*\"]},{\"name\":\"bliklan-compute-engine\",\"repoOwner\":\"gdncomm\",\"repoName\":\"bliklan-compute-engine\",\"automationRepoPath\":\"/Users/yourname/automation-repos/bliklan-compute-engine\",\"apiPatterns\":[\"**/controllers/**\",\"**/routes/**\",\"**/api/**\",\"**/*Controller*\",\"**/*Router*\"]},{\"name\":\"bliklan-credit\",\"repoOwner\":\"gdncomm\",\"repoName\":\"bliklan-credit\",\"automationRepoPath\":\"/Users/yourname/automation-repos/bliklan-credit\",\"apiPatterns\":[\"**/controllers/**\",\"**/routes/**\",\"**/api/**\",\"**/*Controller*\",\"**/*Router*\"]},{\"name\":\"bliklan-ads-engine\",\"repoOwner\":\"gdncomm\",\"repoName\":\"bliklan-ads-engine\",\"automationRepoPath\":\"/Users/yourname/automation-repos/bliklan-ads-engine\",\"apiPatterns\":[\"**/controllers/**\",\"**/routes/**\",\"**/api/**\",\"**/*Controller*\",\"**/*Router*\"]}]"
      }
    }
  }
}
```

#### Important: Find Your Node Path

If you're using **nvm**, you need to use the full path to node:

```bash
# Find your node path
which node
# Example output: /Users/yourname/.nvm/versions/node/v21.5.0/bin/node
```

Use this full path in the `"command"` field.

#### Update Paths

Replace in the config:

- `/path/to/your/node` → Your actual node path (from `which node`)
- `/path/to/api-test-mcp-server` → Where you cloned this repo
- `/Users/yourname/automation-repos/` → Your actual automation repos path
- `github_pat_your_token_here` → Your actual GitHub token

### Step 6: Restart Cursor

**Completely quit Cursor** (Cmd+Q on macOS) and reopen it. The MCP server only loads at startup.

### Step 7: Verify Setup

In Cursor, check **Settings → Features → MCP Servers**. You should see `api-test-server` with a green status.

If you see a red status, check the error message:

- **"Cannot use import statement outside a module"** → Wrong Node.js version (need 18+)
- **"Service not found"** → SERVICES_CONFIG not set correctly
- **"Bad credentials"** → GitHub token is invalid or expired

---

## Available Tools

Once configured, you can ask Cursor to use these tools:

| Tool                   | Description                               | Example                                              |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `list_services`        | List all configured services              | "List all services"                                  |
| `get_recent_commits`   | Get recent commits for a service          | "Get recent commits for bliklan-campaign-management" |
| `get_api_changes`      | Get API changes between branches          | "Get API changes between master and feature/xyz"     |
| `get_api_details`      | Get full content of an API file           | "Get the StoreAdsCampaignController.java file"       |
| `get_pull_requests`    | Get PRs for a service                     | "Show open PRs for bliklan-credit"                   |
| `analyze_api_endpoint` | Extract endpoint definitions from a file  | "Analyze endpoints in UserController.java"           |
| `get_test_template`    | Get a test template for REST/GraphQL/gRPC | "Get a REST test template"                           |
| `compare_branches`     | Compare branches and summarize changes    | "Compare master and release/SP22"                    |

---

## Usage Examples

### Example 1: List Services and Get Recent Commits

```
Use the api-test-server to list services, then get recent commits for bliklan-campaign-management
```

### Example 2: Find API Logic

```
Use the api-test-server to find the logic for storeads/save-campaign API in bliklan-campaign-management
```

### Example 3: Check Recent Changes

```
Get the recent commits for bliklan-credit service and show me any API-related changes
```

### Example 4: Analyze API File

```
Use the MCP server to get the content of src/main/java/com/gdn/bliklan/campaignmanagement/controller/StoreAdsCampaignController.java from bliklan-campaign-management
```

### Example 5: Compare Branches

```
Compare master and release/SP22_RELEASE_01 branches in bliklan-campaign-management to find API changes
```

---

## Testing the MCP Server

Simply ask Cursor to use the tools (this is the normal workflow).

---

### MCP Server Shows Red Status

1. Check Cursor Developer Tools: **Help → Toggle Developer Tools → Console**
2. Look for error messages related to "mcp" or "api-test-server"
3. Verify the node path is correct (use full path from `which node`)
4. Make sure the dist/index.js file exists (run `npm run build`)

### No API Changes Detected

1. Verify `apiPatterns` match your file structure
2. Check if the branches you're comparing exist
3. Try broader patterns like `**/*.java` for testing

---

## Adding New Services

To add a new service, update the `SERVICES_CONFIG` in `~/.cursor/mcp.json`:

```json
{
  "name": "new-service-name",
  "repoOwner": "gdncomm",
  "repoName": "new-service-repo",
  "automationRepoPath": "/path/to/automation/new-service",
  "apiPatterns": [
    "**/controllers/**",
    "**/routes/**",
    "**/api/**",
    "**/*Controller*"
  ]
}
```

Then restart Cursor.

---

## API Patterns

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

## Development

### Run in Development Mode

```bash
npm run dev
```

### Watch for Changes

```bash
npm run watch
```

### Build

```bash
npm run build
```

---

## Project Structure

```
api-test-mcp-server/
├── src/
│   └── index.ts          # Main MCP server implementation
├── dist/                  # Compiled JavaScript (generated)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── cursor-mcp-config.json # Example Cursor MCP configuration
├── config.example.json    # Example service configuration
└── README.md              # This file
```

---
