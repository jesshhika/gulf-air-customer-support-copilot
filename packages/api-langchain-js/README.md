# @azure-ai-travel-agents/langchain-js

LangChain.js orchestrator with Express API server for the Azure AI Travel Agents platform.

## Overview

This package provides a complete standalone service with the LangChain.js-based orchestration layer and an Express API server. It uses LangGraph's supervisor pattern with MCP (Model Context Protocol) adapters to coordinate multiple AI agents for travel-related tasks.

## Features

- **LangGraph Supervisor Pattern**: Coordinates multiple specialized agents
- **MCP Integration**: Uses `@langchain/mcp-adapters` for tool integration
- **Express API Server**: RESTful endpoints with SSE streaming
- **Multiple LLM Providers**: 
  - Azure OpenAI
  - Docker Models
  - GitHub Models
  - Ollama
  - Foundry Local
- **Streaming Support**: Real-time response streaming
- **Type-Safe**: Full TypeScript support
- **Standalone**: Complete service with no external dependencies

## Architecture

The package consists of:

- **Agents** (`src/agents/`): Specialized AI agents for different travel tasks
- **Graph** (`src/graph/`): LangGraph workflow definition
- **Tools** (`src/tools/`): MCP tool bridges and configurations
- **Providers** (`src/providers/`): LLM provider implementations
- **MCP Clients** (`src/mcp/`): MCP protocol client implementations
- **Server** (`src/server.ts`): Express API server

## API Endpoints

### GET /api/health
Health check endpoint
- Returns: `{ status: "OK", orchestrator: "langchain-js" }`

### GET /api/tools
List available MCP tools
- Returns: `{ tools: [...] }`

### POST /api/chat
Chat endpoint with streaming support
- Request body: `{ message: string, tools: Array, customerContext?: SupportPassengerContext, conversationHistory?: ConversationTurn[] }`
- Response: Server-Sent Events stream

`customerContext` contains only the active passenger's booking, route, tier, and preferred language. `conversationHistory` contains up to the recent conversation turns needed to handle follow-up answers. The API does not retain a shared passenger context between requests.

The passenger and flight data in this repository is for local demonstration only. It is not a live reservations, ticketing, check-in, baggage, payment, or CRM integration. Do not pass passport or payment details.

### End-to-end demo workflows

The LangChain.js API provides server-backed **demo-only** workflows for flight search, booking confirmation, and support-case intake:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/demo/flights/search` | Search sample schedules by route, date, passenger count, and cabin |
| `POST` | `/api/demo/bookings` | Confirm a simulated booking and generate a demo reference |
| `GET` | `/api/demo/bookings?passengerId=<profile-id>` | Retrieve that demo profile's saved bookings |
| `POST` | `/api/demo/cases` | Create a support case in a simulated queue |
| `GET` | `/api/demo/cases?passengerId=<profile-id>` | Retrieve that demo profile's support cases |

The UI can download a plain-text itinerary confirmation or case summary after creation. Demo cases have a reference, category, simulated queue, and status; they are **not sent to Gulf Air or a human support team**. Demo bookings do not reserve inventory, issue a ticket, or charge payment.

Records are stored as JSON at `DEMO_WORKFLOWS_FILE` (default: `data/demo-workflows.json` relative to the API working directory). The containing directory must be writable. This file-based store is intended for a single-instance demonstration only; configure a shared persistent database and proper passenger authentication/authorization before production or multi-instance deployment. Local demo records can contain passenger names and case summaries, so do not enter passport, payment, or other sensitive information.

## Usage

### Running the Server

```bash
# Development mode
npm start

# Production build
npm run build
node dist/server.js
```

### Docker

```bash
docker build -t langchain-api .
docker run -p 4000:4000 \
  -e AZURE_OPENAI_API_KEY=your-key \
  langchain-api
```

### Azure App Service

The GitHub Actions workflow at `.github/workflows/main_gulf-air-api.yml` builds this API and deploys its compiled files together with production dependencies. If deploying a prebuilt artifact manually, include the `node_modules` produced by `npm prune --omit=dev`, or configure App Service build automation to install production dependencies during deployment. Starting `dist/server.js` without either will fail with `ERR_MODULE_NOT_FOUND`.

### API Examples

```bash
# Health check
curl http://localhost:4000/api/health

# List tools
curl http://localhost:4000/api/tools

# Chat (streaming)
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Plan a trip to Paris", "tools": [...]}'
```

### Using as a Library

```typescript
import { setupAgents, McpToolsConfig } from '@azure-ai-travel-agents/langchain-js';

const tools = Object.values(McpToolsConfig());
const workflow = await setupAgents(tools);
const result = workflow.run("Plan a trip to Paris");

for await (const event of result) {
  console.log(event);
}
```

Configure via environment variables:

- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint
- `AZURE_OPENAI_DEPLOYMENT_NAME` - Azure OpenAI deployment name (`AZURE_OPENAI_DEPLOYMENT` and `AZURE_AT_MODEL_DEPLOYMENT_NAME` are also accepted)
- `MCP_CUSTOMER_QUERY_URL`, `MCP_DESTINATION_RECOMMENDATION_URL`, `MCP_ITINERARY_PLANNING_URL`, `MCP_ECHO_PING_URL` - Base URLs for deployed MCP services
- `MCP_*_ACCESS_TOKEN` - MCP service access tokens

For Azure App Service, set each MCP URL to a base URL that the App Service can reach; the API appends `/mcp`. Do not use `localhost` for a separately hosted MCP service. Container Apps `.internal` URLs are only reachable from an appropriately network-connected environment. If an MCP service is not deployed or configured, it is omitted from the tools list; `/api/tools` remains available and chat can run without MCP tools. The Azure OpenAI client uses `AZURE_OPENAI_API_KEY` when set, otherwise it uses managed identity.

See `.env.example` in the repository root for all configuration options.

## Development

```bash
# Build
npm run build

# Clean
npm run clean
```

## Dependencies

Key dependencies:
- `@langchain/langgraph` - Graph-based workflow orchestration
- `@langchain/mcp-adapters` - MCP protocol adapters
- `@langchain/openai` - OpenAI/Azure OpenAI integration
- `@azure-ai-travel-agents/shared` - Shared types and utilities

## Related Packages

- `@azure-ai-travel-agents/shared` - Shared types and utilities
- `azure-ai-travel-agents-api` - Main API gateway

## License

MIT
