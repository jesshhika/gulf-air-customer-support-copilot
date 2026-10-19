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
import {
  createDemoBooking,
  createDemoSupportCase,
  getDemoWorkflowCounts,
  listDemoBookings,
  listDemoSupportCases,
  searchDemoFlights,
  DemoWorkflowValidationError,
} from "./demo-workflows.js";

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

apiRouter.post("/demo/flights/search", (req, res) => {
  try {
    res.status(200).json({ flights: searchDemoFlights(req.body) });
  } catch (error) {
    if (error instanceof DemoWorkflowValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Could not search demo flights:", error);
    res.status(500).json({ error: "Could not search demo flights." });
  }
});

apiRouter.post("/demo/bookings", (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new DemoWorkflowValidationError("A demo booking request is required.");
    }
    const booking = createDemoBooking(req.body);
    res.status(201).json({ booking });
  } catch (error) {
    console.error("Could not create demo booking:", error);
    const statusCode = error instanceof DemoWorkflowValidationError ? 400 : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : "Could not create demo booking." });
  }
});

apiRouter.get("/demo/bookings", (req, res) => {
  const passengerId = req.query.passengerId;
  if (typeof passengerId !== "string" || !/^[\w-]{1,80}$/.test(passengerId)) {
    return res.status(400).json({ error: "A valid demo passenger profile is required." });
  }
  try {
    res.status(200).json({ bookings: listDemoBookings(passengerId) });
  } catch (error) {
    console.error("Could not load demo bookings:", error);
    res.status(500).json({ error: "Could not load demo bookings." });
  }
});

apiRouter.post("/demo/cases", (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new DemoWorkflowValidationError("A demo support case request is required.");
    }
    const supportCase = createDemoSupportCase(req.body);
    res.status(201).json({ supportCase });
  } catch (error) {
    console.error("Could not create demo support case:", error);
    const statusCode = error instanceof DemoWorkflowValidationError ? 400 : 500;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : "Could not create demo support case." });
  }
});

apiRouter.get("/demo/cases", (req, res) => {
  const passengerId = req.query.passengerId;
  if (typeof passengerId !== "string" || !/^[\w-]{1,80}$/.test(passengerId)) {
    return res.status(400).json({ error: "A valid demo passenger profile is required." });
  }
  try {
    res.status(200).json({ cases: listDemoSupportCases(passengerId) });
  } catch (error) {
    console.error("Could not load demo support cases:", error);
    res.status(500).json({ error: "Could not load demo support cases." });
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

    const demoWorkflowCounts = getDemoWorkflowCounts();

    let operationalStatus = "Sample schedule data: Normal";

    if (cancelledFlights >= 3) {
      operationalStatus = "Sample schedule data: High disruption";
    } else if (delayedFlights >= 3) {
      operationalStatus = "Sample schedule data: Moderate disruption";
    }

    const response = {
      delayedFlights,
      cancelledFlights,
      divertedFlights,
      passengers: passengers.length,
      operationalStatus,
      highPriorityPassengers,
      demoWorkflowCounts,
      metricScope: "Demonstration records only; no production KPIs or live airline systems are connected.",
      knowledgeBaseStatus: "Local demo policies and sample passenger/disruption data",
      capabilities: [
        {
          title: "Agent Assist",
          description: "Policy guidance and customer-confirmed demo support-case summaries.",
        },
        {
          title: "Disruption Recovery",
          description: "Sample disruption guidance and categorized demo case creation; no live rebooking.",
        },
        {
          title: "Demo Flight Booking",
          description: "Search sample schedules, confirm a simulated booking, and download a confirmation; no ticket or payment.",
        },
        {
          title: "FalconFlyer Loyalty",
          description: "General policy guidance only; no live member account or benefits lookup.",
        },
        {
          title: "Arabic + English",
          description: "English and Arabic chat responses, subject to the configured model.",
        },
        {
          title: "Demo Support Cases",
          description: "Create a reference and simulated support queue; no real support team is contacted.",
        },
      ],
      crmHighlights: [
        `${passengers.length} sample passenger profiles`,
        `${demoWorkflowCounts.bookings} demo bookings saved`,
        `${demoWorkflowCounts.cases} demo support cases saved`,
        `${demoWorkflowCounts.sensitiveCases} sensitive demo cases created`,
        "No CRM, live reservations, payment, or agent-transfer integration",
      ],
      followUpPrompts: [
        "What is your booking reference?",
        "Are you asking about a delay, cancellation, refund, baggage, or check-in issue?",
        "Do you need rebooking, compensation, or a human agent escalation?",
      ],
      supportInsights: [
        {
          label: "Demo bookings saved",
          value: String(demoWorkflowCounts.bookings),
          tone: "success",
        },
        {
          label: "Demo support cases",
          value: String(demoWorkflowCounts.cases),
          tone: "warning",
        },
        {
          label: "Sensitive demo cases",
          value: String(demoWorkflowCounts.sensitiveCases),
          tone: "danger",
        },
      ],
      assistantMode: {
        language: "English / Arabic",
        workflow: "Customer-confirmed demo bookings and support cases",
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
