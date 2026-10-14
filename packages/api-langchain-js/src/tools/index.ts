import { McpServerDefinition } from "../utils/types.js";

export type McpServerName =
  | "echo-ping"
  | "customer-query"
  | "itinerary-planning"
  | "destination-recommendation";

const MCP_API_HTTP_PATH = "/mcp";

export const McpToolsConfig = (): Partial<Record<McpServerName, McpServerDefinition>> => {
  const servers: Partial<Record<McpServerName, McpServerDefinition>> = {};
  const serverConfigs: {
    id: McpServerName;
    name: string;
    environmentVariable: string;
  }[] = [
    {
      id: "echo-ping",
      name: "Echo Test",
      environmentVariable: "MCP_ECHO_PING_URL",
    },
    {
      id: "customer-query",
      name: "Customer Query",
      environmentVariable: "MCP_CUSTOMER_QUERY_URL",
    },
    {
      id: "itinerary-planning",
      name: "Itinerary Planning",
      environmentVariable: "MCP_ITINERARY_PLANNING_URL",
    },
    {
      id: "destination-recommendation",
      name: "Destination Recommendation",
      environmentVariable: "MCP_DESTINATION_RECOMMENDATION_URL",
    },
  ];

  for (const { id, name, environmentVariable } of serverConfigs) {
    const baseUrl = process.env[environmentVariable]?.trim().replace(/\/+$/, "");
    if (!baseUrl) {
      console.info(`Skipping ${name}: ${environmentVariable} is not configured`);
      continue;
    }

    const accessToken = id === "echo-ping"
      ? process.env["MCP_ECHO_PING_ACCESS_TOKEN"]
      : undefined;
    servers[id] = {
      config: {
        url: `${baseUrl}${MCP_API_HTTP_PATH}`,
        type: "http",
        verbose: true,
        ...(accessToken
          ? { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } }
          : {}),
      },
      id,
      name,
    };
  }

  return servers;
};