import fs from "fs";
import path from "path";
import { SystemMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { McpServerDefinition } from "../utils/types.js";
import { AgentState, setupAgents } from "../agents/index.js";
import { ReactAgent } from "langchain";

export interface WorkflowState extends AgentState {
  messages: BaseMessage[];
  currentAgent?: string;
  toolsOutput?: any[];
  next?: string;
}

export interface SupportPassengerContext {
  bookingReference?: string;
  passengerName?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  falconFlyerTier?: string;
  bookingStatus?: string;
  preferredLanguage?: "en" | "ar";
}

export class TravelAgentsWorkflow {
  private llm: BaseChatModel;
  private agents: any[] = [];
  private deepAgent: ReactAgent | null = null;

  constructor(llm: BaseChatModel) {
    this.llm = llm;
  }

  async initialize(filteredTools: McpServerDefinition[] = []) {
    console.log("Initializing Langchain workflow with filtered tools:", filteredTools.map(t => t.id));
    
    // Setup agents and tools
    const { agents, deepAgent} = await setupAgents(filteredTools, this.llm);
    this.agents = agents;
    this.deepAgent = deepAgent;

    console.log("Langchain workflow initialized successfully");
    console.log("Available agents:", Object.keys(this.agents));
  }

  async *run(
    input: string,
    selectedPassenger: SupportPassengerContext = {},
    conversationHistory: { role: "user" | "assistant"; content: string }[] = [],
  ) {
    const agent = "TravelAgent";

    try {
      const isArabic = selectedPassenger.preferredLanguage === "ar" ||
        /[\u0600-\u06FF]/.test(input) ||
        /\b(arabic|عربي|العربية)\b/i.test(input);
      const trimmedInput = input.trim();
      const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|marhaba|مرحبا|السلام عليكم)[!,.؟\s]*$/i.test(trimmedInput);
      const isThanks = /^(thanks|thank you|thx|شكرا|شكرًا|مشكور|مشكورة)[!,.؟\s]*$/i.test(trimmedInput);
      if (isGreeting || isThanks) {
        const firstName = selectedPassenger.passengerName?.trim().split(/\s+/)[0];
        const response = isThanks
          ? (isArabic ? "على الرحب والسعة. هل تحتاج إلى مساعدة أخرى بشأن رحلتك؟" : "You're welcome. Is there anything else I can help with for your journey?")
          : (isArabic
            ? `مرحباً${firstName ? ` ${firstName}` : ""}! كيف يمكنني مساعدتك اليوم؟ يمكنني المساعدة في حالة الرحلة أو الحجز أو الأمتعة أو الاسترداد أو فلاي فلاير، كما يمكنك البحث عن رحلة جديدة.`
            : `Hello${firstName ? `, ${firstName}` : ""}! How can I help today? I can assist with flight status, bookings, baggage, refunds, FalconFlyer, or finding a new flight.`);
        yield {
          eventName: "agent_complete",
          data: { agent, messages: [{ content: response }] },
        };
        return;
      }

      const disruptionsPath = path.join(process.cwd(), "data", "flight-disruptions.json");
      const policiesPath = path.join(process.cwd(), "data", "gulf-air-policies.txt");
      const disruptions = fs.readFileSync(disruptionsPath, "utf-8");
      const policies = fs.readFileSync(policiesPath, "utf-8");

      const baggagePolicy = fs.readFileSync(path.resolve("data", "baggage-policy.txt"), "utf-8");
      const refundPolicy = fs.readFileSync(path.resolve("data", "refund-policy.txt"), "utf-8");
      const checkinPolicy = fs.readFileSync(path.resolve("data", "checkin-policy.txt"), "utf-8");
      const assistancePolicy = fs.readFileSync(path.resolve("data", "special-assistance-policy.txt"), "utf-8");
      const falconFlyerPolicy = fs.readFileSync(path.resolve("data", "falcon-flyer-policy.txt"), "utf-8");
      const passengers = fs.readFileSync(path.resolve("data", "passengers.json"), "utf-8");
      const rebookings = fs.readFileSync(path.resolve("data", "rebookings.json"), "utf-8");

      let rebookingOptions = "[]";
      try {
        rebookingOptions = fs.readFileSync(path.resolve("data", "rebooking_options.json"), "utf-8");
      } catch (err) {
        console.warn("rebooking_options.json not found");
      }

      const history = Array.isArray(conversationHistory)
        ? conversationHistory.filter((turn) => turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string").slice(-8)
        : [];
      const priorCustomerMessages = history.filter((turn) => turn.role === "user").map((turn) => turn.content);
      const combinedInput = [...priorCustomerMessages, input].join("\n");
      const bookingMatch = input.match(/GA\d+/i) ||
        [...priorCustomerMessages].reverse().map((message) => message.match(/GA\d+/i)).find(Boolean);
      const flightMatch = input.match(/GF\d+/i);
      const passengerRecords = JSON.parse(passengers);
      const explicitBookingReference = bookingMatch?.[0].toUpperCase();
      const selectedBookingReference = selectedPassenger.bookingReference?.toUpperCase();
      if (explicitBookingReference && selectedBookingReference && explicitBookingReference !== selectedBookingReference) {
        const reply = isArabic
          ? "لخصوصية المسافرين، مساحة العمل هذه مرتبطة بالملف الشخصي المحدد فقط. بدّل إلى ملف المسافر المطابق قبل السؤال عن حجز آخر."
          : "To protect passenger privacy, this workspace can only assist with the selected profile. Switch to the matching passenger profile before asking about another booking.";
        yield { eventName: "agent_complete", data: { agent, messages: [{ content: reply }] } };
        return;
      }
      const matchedPassenger = passengerRecords.find((record: any) =>
        record.bookingReference === selectedBookingReference
      );
      const currentPassenger = matchedPassenger || selectedPassenger;
      const bookingReference = currentPassenger?.bookingReference;
      const passengerName = currentPassenger?.name || currentPassenger?.passengerName;
      const flightNumber = currentPassenger?.flightNumber || flightMatch?.[0]?.toUpperCase();
      const origin = currentPassenger?.origin;
      const destination = currentPassenger?.destination;
      const falconFlyerTier = currentPassenger?.falconFlyerTier;
      const language = isArabic ? "Arabic" : "English";
      const isSensitive = /(medical|bereavement|legal|complaint|harassment|threat|unsafe|emergency)/i.test(combinedInput);
      const asksForPersonalBookingAction = /(my booking|my flight|my refund|refund status|booking status|change my booking|change booking|rebook my|my points|my falconflyer|check in for me)/i.test(combinedInput);
      const isNewFlightSearch = /\b(book|booking|buy|purchase|reserve)\b.*\b(flight|ticket)\b|\b(flight|ticket)\b.*\b(book|booking|purchase)\b/i.test(input);

      if (isSensitive) {
        const reply = isArabic
          ? "أفهم أن هذه المسألة حساسة. تحتاج إلى مراجعة موظف من طيران الخليج، ولا يستطيع هذا العرض التجريبي تحويلك مباشرةً إلى موظف. يرجى التواصل مع قناة دعم طيران الخليج الرسمية. يمكنني المساعدة في إعداد ملخص للحالة دون تأكيد استرداد أو تعويض."
          : "I understand this is sensitive. A Gulf Air support professional should review it, but this demo cannot transfer you to an agent. Please contact an official Gulf Air support channel. I can help prepare a case summary, but I cannot confirm a refund or compensation.";
        yield { eventName: "agent_complete", data: { agent, messages: [{ content: reply }] } };
        return;
      }

      if (isNewFlightSearch) {
        const reply = isArabic
          ? "يمكنك البحث عن رحلات الخليج للطيران من زر «حجز رحلة» في مساحة الدعم. الجداول والأسعار تجريبية فقط، ولا يتم إصدار تذكرة أو إجراء دفع."
          : "You can search Gulf Air flights using “Book flight” in the support workspace. The schedules and prices are demo data; no ticket or payment is issued.";
        yield { eventName: "agent_complete", data: { agent, messages: [{ content: reply }] } };
        return;
      }

      if (asksForPersonalBookingAction && !bookingReference) {
        const reply = isArabic
          ? "لا يوجد حجز مرتبط بهذا الملف التجريبي حالياً. يمكنك البحث عن رحلة جديدة أو اختيار ملف المسافر المرتبط بحجزك."
          : "There is no booking linked to this demo profile yet. You can search for a new flight or switch to the passenger profile linked to your booking.";
        yield {
          eventName: "agent_complete",
          data: { agent, messages: [{ content: reply }] },
        };
        return;
      }

      const systemPrompt = `
You are Gulf Air's Customer Support and Disruption Recovery Copilot.

Your role is to provide grounded, customer-safe airline support only. Your responsibilities include:
- Flight status and disruption handling
- Rebooking and travel recovery
- Refund and compensation eligibility
- Baggage support and baggage tracing
- Check-in and travel experience requests
- Special assistance and accessibility support
- FalconFlyer program guidance and offers
- Complaint, medical, bereavement, and legal escalation handling
- New-flight search guidance through the demo booking experience

Do not answer as a tourism or hotel booking assistant. If the customer asks for destinations, hotels, sightseeing, or general travel plans, redirect to airline support only.

Follow these rules strictly:
1. Ground all answers in the Gulf Air policy, airport disruption information, and passenger records supplied below.
2. Never invent compensation, fare rules, or promises if the policy is unclear.
3. If required information is missing, ask only the minimum questions needed for safe action.
4. For sensitive topics such as medical, bereavement, legal, or complaint cases, escalate to a human agent and include a clear handoff summary.
5. Use concise, professional customer-service language.
6. Respond in ${language}, unless the customer explicitly asks for another language.
7. For simple greetings, respond warmly and briefly; do not ask for booking details.
8. For general policy questions, answer from the supplied policy even when no booking reference is provided.
9. Ask one concise follow-up question only when a personal booking action cannot be completed without a missing detail.
10. For sensitive topics such as medical, bereavement, legal, or complaint cases, recommend a human handoff and do not promise an outcome.
11. End policy-based answers with a short source note naming the supplied policy file and heading. Never invent a policy version, section, eligibility, fare, or compensation amount; if no matching source is present, say that policy guidance could not be verified.
12. Treat sample flight and passenger data as demo-only; do not claim access to live reservations, check-in, baggage tracking, or payment systems.
13. Put the direct answer first, then a short explanation and one useful next step where appropriate.
14. Never reveal another passenger's name, booking reference, contact details, or case history. For requests about other passengers, explain that you can only assist with the currently selected passenger.

========================================
FLIGHT DISRUPTION DATA
========================================
${disruptions}

========================================
GULF AIR POLICIES
========================================
${policies}

Baggage Policy:
${baggagePolicy}

Refund Policy:
${refundPolicy}

Check-In Policy:
${checkinPolicy}

Special Assistance Policy:
${assistancePolicy}

FalconFlyer Loyalty Policy:
${falconFlyerPolicy}

========================================
PASSENGER RECORDS
========================================
${JSON.stringify(currentPassenger ? {
  bookingReference,
  name: passengerName,
  flightNumber,
  origin,
  destination,
  falconFlyerTier,
  bookingStatus: currentPassenger.status || currentPassenger.bookingStatus,
} : "No passenger profile selected. Do not infer or retrieve passenger details from other records.")}

Existing Rebookings:
${rebookings}

Rebooking Options:
${rebookingOptions}
`;

      const memoryPrompt = `
CURRENT CUSTOMER CONTEXT
Booking Reference: ${bookingReference || "Unknown"}
Passenger Name: ${passengerName || "Unknown"}
Flight Number: ${flightNumber || "Unknown"}
Origin: ${origin || "Unknown"}
Destination: ${destination || "Unknown"}
FalconFlyer Tier: ${falconFlyerTier || "Unknown"}
Booking Status: ${currentPassenger?.status || currentPassenger?.bookingStatus || "Unknown"}

Use only this selected passenger context for personal questions. Context is supplied with each request; never carry one passenger's information into another passenger's case. Do not ask for a booking reference again when one is already available. ${isSensitive ? "This is a sensitive case; recommend a human handoff." : ""}`;

      const priorMessages = history.map((turn) => {
        const content = turn.content.slice(0, 4000);
        return turn.role === "assistant" ? new AIMessage(content) : new HumanMessage(content);
      });
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt + `\n\n` + memoryPrompt),
        ...priorMessages,
        new HumanMessage(input),
      ]);

      yield {
        eventName: "agent_complete",
        data: {
          agent,
          messages: [response],
        },
      };

      return;
    } catch (error) {
      console.error("Error in workflow execution:", error);
      yield {
        eventName: "workflow_error",
        data: {
          agent,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}