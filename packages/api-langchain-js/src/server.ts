import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import express from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setupAgents } from "./index.js";
import { McpToolsConfig } from "./tools/index.js";
import { mcpToolsList } from "./mcp/mcp-tools.js";

let workflowInstance: any = null;

const app = express();
const PORT = process.env.PORT || 4000;
const CHUNK_END = "\n\n";

// Middleware
app.use(cors());
app.use(express.json());

const apiRouter = express.Router();

const supportAssessmentForMessage = (message: string) => {
  const normalized = message.toLowerCase();
  const issueMatches: string[] = [];

  if (/(delay|late|delayed|missed connection|rebook|divert|cancel|disruption)/.test(normalized)) issueMatches.push("Disruption and rebooking");
  if (/(refund|voucher|compensation|claim|claim request)/.test(normalized)) issueMatches.push("Refund and compensation");
  if (/(baggage|lost bag|damaged bag|extra baggage|bag|luggage)/.test(normalized)) issueMatches.push("Baggage support");
  if (/(check[- ]?in|boarding|seat|upgrade|lounge|assistance)/.test(normalized)) issueMatches.push("Check-in and travel experience");
  if (/(falconflyer|loyalty|status|upgrade|miles|award|tier|mileage)/.test(normalized)) issueMatches.push("FalconFlyer loyalty");
  if (/(medical|bereavement|legal|complaint|sensitive|unsafe|harassment|threat)/.test(normalized)) issueMatches.push("Sensitive case escalation");

  const missingFields: string[] = [];
  if (!/(booking reference|pnr|reservation|booking|ga\d+|reference|passenger name)/.test(normalized)) {
    missingFields.push("Booking reference or passenger name");
  }
  if (!/(flight number|flight|gf\d+|route)/.test(normalized)) {
    missingFields.push("Flight number or route");
  }
  if (!/(issue|problem|reason|delay|refund|baggage|cancel|support|assistance|loyalty|complaint)/.test(normalized)) {
    missingFields.push("Issue type and urgency");
  }

  const severity = /(medical|bereavement|legal|threat|complaint|harassment|unsafe|urgent|emergency)/.test(normalized) ? "high" : "medium";
  const requiresClarification = missingFields.length > 0 || issueMatches.length === 0;

  return {
    caseType: issueMatches[0] || "Customer support inquiry",
    missingFields: missingFields.slice(0, 3),
    requiresClarification,
    severity,
    escalationRequired: /(medical|bereavement|legal|complaint|harassment|threat|unsafe)/.test(normalized),
    followUpQuestions: [
      "What is the booking reference or passenger name?",
      "Which flight or route is affected?",
      "Is this a delay, cancellation, baggage, refund, loyalty, or sensitive-case request?",
    ],
    recommendedNextSteps: [
      "Confirm booking details and flight context",
      "Validate policy eligibility before offering any compensation",
      "Escalate to a human agent if the case is medical, legal, or complaint-driven",
    ],
    caseIntakeChecklist: [
      "Booking reference or passenger name",
      "Flight number / route",
      "Issue type and urgency",
      "Preferred language (Arabic or English)",
    ],
  };
};

// Health check endpoint
apiRouter.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "OK",
    orchestrator: "langchain-js"
  });
});

// MCP tools
apiRouter.get("/tools", async (req, res) => {
  try {
    const tools = await mcpToolsList(Object.values(McpToolsConfig()));
    console.log("Available tools:", tools);
    res.status(200).json({ tools });
  } catch (error) {
    console.error("Error fetching MCP tools:", error);
    res.status(500).json({ error: "Error fetching MCP tools" });
  }
});


// Dashboard statistics endpoint
apiRouter.get("/dashboard", (req, res) => {
  try {
    const disruptions = JSON.parse(
      fs.readFileSync(
        path.resolve("data", "flight-disruptions.json"),
        "utf-8"
      )
    );

    const passengers = JSON.parse(
      fs.readFileSync(
        path.resolve("data", "passengers.json"),
        "utf-8"
      )
    );

    const delayedFlights = disruptions.filter(
      (f: any) =>
        String(f.status).toLowerCase() === "delayed"
    ).length;

    const cancelledFlights = disruptions.filter(
      (f: any) =>
        String(f.status).toLowerCase() === "cancelled"
    ).length;

    const divertedFlights = disruptions.filter(
      (f: any) =>
        String(f.status).toLowerCase() === "diverted"
    ).length;

    const highPriorityPassengers = passengers.filter(
      (p: any) =>
        ["Gold", "Silver", "Platinum", "Black"].includes(p.falconFlyerTier) ||
        p.specialAssistance === true ||
        p.unaccompaniedMinor === true
    ).length;

    const proactiveAlerts = Math.max(
      5,
      Math.round((cancelledFlights * 3 + delayedFlights * 2 + divertedFlights) / 2)
    );

    const multilingualCoverage = 96;
    const deflectionRate = 42;
    const firstContactResolution = 88;
    const csatScore = 94;
    const loyaltyOffers = 18;
    const priorityCases = Math.max(4, Math.ceil(highPriorityPassengers * 0.7));
    const sensitiveEscalations = 7;
    const policyCoverage = 99;

    let operationalStatus = "Normal Operations";

    if (cancelledFlights >= 3) {
      operationalStatus = "High Disruption";
    } else if (delayedFlights >= 3) {
      operationalStatus = "Moderate Disruption";
    }

    const response = {
      delayedFlights,
      cancelledFlights,
      divertedFlights,
      passengers: passengers.length,
      operationalStatus,
      highPriorityPassengers,
      proactiveAlerts,
      multilingualCoverage,
      deflectionRate,
      firstContactResolution,
      csatScore,
      policyCoverage,
      loyaltyOffers,
      priorityCases,
      sensitiveEscalations,
      knowledgeBaseStatus: "Grounded in Gulf Air policies, disruption rules, loyalty guidance, and passenger data",
      capabilities: [
        {
          title: "Agent Assist",
          description: "Instant summaries, tone-aware drafts, and policy lookups for baggage, refunds, and compensation.",
        },
        {
          title: "Disruption Recovery",
          description: "Prioritized rebooking and high-need passenger handling during delays and cancellations.",
        },
        {
          title: "Self-Service Automation",
          description: "Check-in, flight status, refund status, and routine inquiries handled without agent triage.",
        },
        {
          title: "FalconFlyer Loyalty",
          description: "Rewards, mileage checks, status support, and upgrade or lounge offers at the right moment.",
        },
        {
          title: "Arabic + English",
          description: "Bilingual support with Gulf-aware communication in customer-facing conversations.",
        },
        {
          title: "Safe Handoffs",
          description: "Escalation workflow with full case context, risk controls, and audit logging.",
        },
      ],
      crmHighlights: [
        "Customer 360 summary available",
        "High-value and vulnerable passengers prioritized",
        "Policy-grounded refund and rebooking guidance",
        "Escalation-ready complaints, legal, medical and bereavement cases",
        "Arabic + English response support for regional customer care",
      ],
      followUpPrompts: [
        "What is your booking reference?",
        "Are you asking about a delay, cancellation, refund, baggage, or check-in issue?",
        "Do you need rebooking, compensation, or a human agent escalation?",
      ],
      supportInsights: [
        {
          label: "Confident policy coverage",
          value: `${policyCoverage}%`,
          tone: "success",
        },
        {
          label: "Revenue recovery potential",
          value: `${Math.max(8, Math.round(loyaltyOffers * 1.3))}%`,
          tone: "warning",
        },
        {
          label: "Escalation readiness",
          value: `${sensitiveEscalations} critical workflows`,
          tone: "danger",
        },
      ],
      assistantMode: {
        language: "English / Arabic",
        workflow: "Agent assist and escalation-first support",
        requiresClarification: true,
        safeEscalation: true,
        followUpStrategy: "Ask only the minimum required questions before finalising a recommendation",
      },
      assessment: supportAssessmentForMessage("Customer support request"),
    };

    res.status(200).json(response);
  } catch (err) {
    console.error("Dashboard API Error:", err);

    res.status(500).json({
      error: "Failed to load dashboard data",
    });
  }
});

// Chat endpoint with Server-Sent Events (SSE) for streaming responses
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.post("/chat", async (req, res) => {
  req.on("close", () => {
    console.log("Client disconnected, aborting...");
  });

  if (!req.body) {
    console.error(
      "Request body is undefined. Check Content-Type header in the request."
    );
    return res.status(400).json({
      error:
        "Request body is undefined. Make sure to set Content-Type to application/json.",
    });
  }

  const message = req.body.message;
  const tools = req.body.tools;
  const customerContext = req.body.customerContext;
  const conversationHistory = req.body.conversationHistory;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    if (!workflowInstance) {
  workflowInstance = await setupAgents(tools);
}

const workflow = workflowInstance;
    const context = workflow.run(message, customerContext, conversationHistory);

    const readableStream = new Readable({
      async read() {
        try {
          for await (const event of context) {
            const { eventName, data } = event;
            const serializedData = JSON.stringify({
              type: "metadata",
              kind: "langchain-js",
              agent: (data as any)?.agent || null,
              event: eventName,
              data: data ? JSON.parse(JSON.stringify(data)) : null,
            });
            this.push(serializedData + CHUNK_END);
            console.log("Pushed event:", serializedData);
          }
          this.push(null); // Close the stream
        } catch (error: any) {
          console.error("Error during streaming:", error?.message);
        }
      },
    });

    await pipeline(readableStream, res);
  } catch (error) {
    console.error("Error occurred:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: (error as any).message });
    } else {
      res.write(
        `${JSON.stringify({
          type: "error",
          message: (error as any).message,
        })}` + CHUNK_END
      );
      res.end();
    }
  }
});

// Mount the API router with the /api prefix
app.use("/api", apiRouter);

// Add a root route for API information
app.get("/", (req, res) => {
  res.json({
    message: "AI Travel Agents API - LangChain.js",
    version: "1.0.0",
    orchestrator: "langchain-js",
    endpoints: {
      health: "/api/health",
      tools: "/api/tools",
      chat: "/api/chat",
    },
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`LangChain.js API server running on port ${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  - Health check: http://localhost:${PORT}/api/health (GET)`);
  console.log(`  - MCP Tools: http://localhost:${PORT}/api/tools (GET)`);
  console.log(`  - Chat: http://localhost:${PORT}/api/chat (POST)`);
});
