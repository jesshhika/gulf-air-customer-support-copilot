import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createAgent } from "langchain";
import { createDeepAgent } from "deepagents";
import { McpToolsConfig } from "../tools/index.js";
import { createMcpToolsFromDefinition } from "../tools/mcp-bridge.js";
import { McpServerDefinition } from "../utils/types.js";

// Define the state for our graph
export interface AgentState {
  messages: BaseMessage[];
  currentAgent?: string;
  toolsOutput?: any[];
}

// Helper function to create MCP tools based on server configuration  
export const createMcpTools = async (mcpServerConfig: McpServerDefinition): Promise<DynamicStructuredTool[]> => {
  return createMcpToolsFromDefinition(mcpServerConfig);
};

// Function to setup agents with filtered tools
export const setupAgents = async (
  filteredTools: McpServerDefinition[] = [],
  model: BaseChatModel
) => {
  const tools = Object.fromEntries(
    filteredTools.map((tool) => [tool.id, true])
  );
  console.log("Filtered tools:", tools);

  const agents: any[] = [];
  let mcpTools: DynamicStructuredTool[] = [];
  const mcpToolsConfig = McpToolsConfig();

  // Create agents based on available tools
  if (tools["echo-ping"] && mcpToolsConfig["echo-ping"]) {
    const mcpServerConfig = mcpToolsConfig["echo-ping"];
    const echoTools = await createMcpTools(mcpServerConfig);
    
    const graph = createAgent({
      model,
      name: "EchoAgent",
      tools: echoTools,
      systemPrompt: "Echo back the received input. Do not respond with anything else. Always call the tools.",
    });

    const agent = {
      name: "EchoAgent",
      description: "Echo back the received input. Do not respond with anything else. Always call the tools.",
      runnable: createAgent({
      model,
      tools: echoTools,
      systemPrompt: "You are an Echo Agent that echoes back the received input. Do not respond with anything else. Always call the tools.",
    })
    };
    
    agents.push(agent);
    mcpTools.push(...echoTools);
  }

  if (tools["customer-query"] && mcpToolsConfig["customer-query"]) {
    const mcpServerConfig = mcpToolsConfig["customer-query"];
    const customerTools = await createMcpTools(mcpServerConfig);

    const graph = createAgent({
  model,
  name: "CustomerServiceAgent",
  tools: customerTools,
 systemPrompt: `
You are Gulf Air's Customer Service Agent.

Your responsibilities include:

- Baggage allowance questions
- Refund policies
- Check-in policies
- Special assistance requests
- General customer service support

Always provide responses using Gulf Air policies and procedures.
`,
});
    const agent = {
  name: "CustomerServiceAgent",
  description:
    "Provides Gulf Air customer service assistance including baggage, refunds, check-in policies, special assistance requests, and general passenger support.",
  runnable: createAgent({
    model,
    name: "CustomerServiceAgent",
    tools: customerTools,
    systemPrompt: `
You are Gulf Air's Customer Service Agent.

Your responsibilities include:

- Baggage allowance questions
- Refund policies
- Check-in policies
- Special assistance requests
- General customer service support

Always provide responses using Gulf Air policies and procedures.
`,
  }),
};
    agents.push(agent);
    mcpTools.push(...customerTools);
  }

  if (tools["itinerary-planning"] && mcpToolsConfig["itinerary-planning"]) {
    const mcpServerConfig = mcpToolsConfig["itinerary-planning"];
    const itineraryTools = await createMcpTools(mcpServerConfig);

    const agent = {
  name: "PassengerLookupAgent",
  description:
    "Provides passenger lookup services using booking references, passenger records, flight status information, and personalized assistance.",
  runnable: createAgent({
    model,
    name: "PassengerLookupAgent",
    tools: itineraryTools,
    systemPrompt: `
You are Gulf Air's Passenger Lookup Agent.

Your responsibilities include:

- Booking reference lookup
- Passenger profile lookup
- Flight assignment lookup
- Passenger status lookup
- Personalized travel assistance

Provide responses using passenger records and operational flight information.
`,
  }),
};


    agents.push(agent);
    mcpTools.push(...itineraryTools);
  }

  if (tools["destination-recommendation"] && mcpToolsConfig["destination-recommendation"]) {
    const mcpServerConfig = mcpToolsConfig["destination-recommendation"];
    const destinationTools = await createMcpTools(mcpServerConfig);

    const agent = {
  name: "OperationsAgent",
  description:
    "Provides Gulf Air operational information including delays, cancellations, diversions, flight status, and disruption summaries.",
  runnable: createAgent({
    model,
    name: "OperationsAgent",
    tools: destinationTools,
    systemPrompt: `
You are Gulf Air's Operations Agent.

Your responsibilities include:

- Flight delays
- Flight cancellations
- Flight diversions
- Flight status enquiries
- Operational disruptions
- Operational summaries

Provide clear operational guidance and passenger assistance recommendations.
`,
  }),
};

    agents.push(agent);
    mcpTools.push(...destinationTools);
  }

  console.log("Agents created:", Object.keys(agents));
  console.log("All tools count:", mcpTools.length);

  const deepAgent = createDeepAgent({
    model,
    subagents: agents,
systemPrompt: `
You are Gulf Air's Supervisor Agent.

Route requests to the most appropriate specialist agent.

Use:

- OperationsAgent for flight status, delays, cancellations, diversions, and disruption summaries.
- CustomerServiceAgent for baggage, refunds, check-in policies, and special assistance.
- PassengerLookupAgent for booking references, passenger records, and personalized assistance.

If multiple agents are relevant, combine their information into a single response.
`,    tools: mcpTools,
  });

  return { agents, mcpTools, deepAgent };
};
