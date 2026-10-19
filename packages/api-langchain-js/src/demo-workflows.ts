import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";

export interface DemoFlightSearch {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  cabin: "Economy" | "Falcon Gold";
}

export interface DemoFlightOption extends DemoFlightSearch {
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  fare: string;
  pricePerPassenger: number;
  totalPrice: number;
}

export interface DemoBooking extends DemoFlightOption {
  bookingReference: string;
  passengerId: string;
  passengerName: string;
  status: "Confirmed (demo)";
  createdAt: string;
}

export interface DemoSupportCase {
  caseId: string;
  passengerId: string;
  passengerName: string;
  bookingReference?: string;
  flightNumber?: string;
  category: "Disruption" | "Baggage" | "Refund" | "Check-in" | "FalconFlyer" | "Special assistance" | "Sensitive escalation" | "Other";
  description: string;
  assignedQueue: string;
  status: "Created (demo only - not sent)";
  createdAt: string;
}

interface DemoWorkflowData {
  bookings: DemoBooking[];
  cases: DemoSupportCase[];
}

const AIRPORTS = new Set(["BAH", "LHR", "DXB", "JED", "MED", "DAC", "DEL"]);
const CABINS = new Set(["Economy", "Falcon Gold"]);
const CASE_CATEGORIES = new Set<DemoSupportCase["category"]>([
  "Disruption",
  "Baggage",
  "Refund",
  "Check-in",
  "FalconFlyer",
  "Special assistance",
  "Sensitive escalation",
  "Other",
]);
const QUEUES: Record<DemoSupportCase["category"], string> = {
  Disruption: "Demo disruption support queue",
  Baggage: "Demo baggage support queue",
  Refund: "Demo refund support queue",
  "Check-in": "Demo airport support queue",
  FalconFlyer: "Demo loyalty support queue",
  "Special assistance": "Demo special assistance queue",
  "Sensitive escalation": "Demo sensitive case escalation queue",
  Other: "Demo customer care queue",
};

const AIRPORT_COORDINATES: Record<string, [number, number]> = {
  BAH: [26.2708, 50.6336],
  LHR: [51.47, -0.4543],
  DXB: [25.2532, 55.3657],
  JED: [21.6796, 39.1565],
  MED: [24.5534, 39.7051],
  DAC: [23.8433, 90.3978],
  DEL: [28.5562, 77.1],
};

const dataFile = process.env.DEMO_WORKFLOWS_FILE || path.resolve("data", "demo-workflows.json");

export class DemoWorkflowValidationError extends Error {}

function loadData(): DemoWorkflowData {
  if (!fs.existsSync(dataFile)) {
    return { bookings: [], cases: [] };
  }

  const parsed: unknown = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as DemoWorkflowData).bookings) ||
    !Array.isArray((parsed as DemoWorkflowData).cases)
  ) {
    throw new Error(`Demo workflow data file has an invalid format: ${dataFile}`);
  }
  return parsed as DemoWorkflowData;
}

function saveData(data: DemoWorkflowData): void {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temporaryFile, dataFile);
}

function validatePassenger(
  input: { passengerId: unknown; passengerName: unknown },
): asserts input is { passengerId: string; passengerName: string } {
  if (typeof input.passengerId !== "string" || !/^[\w-]{1,80}$/.test(input.passengerId)) {
    throw new DemoWorkflowValidationError("A valid demo passenger profile is required.");
  }
  if (typeof input.passengerName !== "string" || !input.passengerName.trim() || input.passengerName.trim().length > 120) {
    throw new DemoWorkflowValidationError("A passenger name is required.");
  }
}

function validateSearch(search: DemoFlightSearch): void {
  if (!search || !AIRPORTS.has(search.origin) || !AIRPORTS.has(search.destination) || search.origin === search.destination) {
    throw new DemoWorkflowValidationError("Choose two different supported demo airports.");
  }
  const parsedDate = new Date(`${search.departureDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(search.departureDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== search.departureDate
  ) {
    throw new DemoWorkflowValidationError("A valid departure date is required.");
  }
  if (!Number.isInteger(search.passengers) || search.passengers < 1 || search.passengers > 4) {
    throw new DemoWorkflowValidationError("Choose between one and four passengers.");
  }
  if (!CABINS.has(search.cabin)) {
    throw new DemoWorkflowValidationError("Choose a supported demo cabin.");
  }
}

function createFlightOptions(search: DemoFlightSearch): DemoFlightOption[] {
  validateSearch(search);
  const base = 115 + Math.round(getDistanceKm(search.origin, search.destination) * 0.075);
  const cabinMultiplier = search.cabin === "Falcon Gold" ? 2.4 : 1;
  const durationMinutes = Math.round((getDistanceKm(search.origin, search.destination) / 800) * 60 + 35);
  const schedules = [
    { number: "121", departure: "08:40", fare: "Light", fareMultiplier: 1 },
    { number: "125", departure: "13:15", fare: "Smart", fareMultiplier: 1.3 },
    { number: "129", departure: "18:30", fare: "Flex", fareMultiplier: 1.7 },
  ];

  return schedules.map((schedule) => {
    const pricePerPassenger = Math.round(base * cabinMultiplier * schedule.fareMultiplier);
    const [hours, minutes] = schedule.departure.split(":").map(Number);
    const arrivalTotalMinutes = (hours * 60 + minutes + durationMinutes) % (24 * 60);
    return {
      ...search,
      flightNumber: `GF${schedule.number}`,
      departureTime: schedule.departure,
      arrivalTime: `${String(Math.floor(arrivalTotalMinutes / 60)).padStart(2, "0")}:${String(arrivalTotalMinutes % 60).padStart(2, "0")}`,
      duration: `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`,
      fare: schedule.fare,
      pricePerPassenger,
      totalPrice: pricePerPassenger * search.passengers,
    };
  });
}

function getDistanceKm(origin: string, destination: string): number {
  const [originLatitude, originLongitude] = AIRPORT_COORDINATES[origin];
  const [destinationLatitude, destinationLongitude] = AIRPORT_COORDINATES[destination];
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(destinationLatitude - originLatitude);
  const longitudeDelta = toRadians(destinationLongitude - originLongitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(originLatitude)) *
      Math.cos(toRadians(destinationLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function searchDemoFlights(search: DemoFlightSearch): DemoFlightOption[] {
  return createFlightOptions(search);
}

export function createDemoBooking(input: {
  passengerId: unknown;
  passengerName: unknown;
  flight: DemoFlightOption;
}): DemoBooking {
  validatePassenger(input);
  const [flight] = createFlightOptions(input.flight);
  if (!flight || flight.flightNumber !== input.flight.flightNumber) {
    throw new DemoWorkflowValidationError("Choose a flight from the current demo search results.");
  }

  const data = loadData();
  const booking: DemoBooking = {
    ...flight,
    bookingReference: `GD${randomInt(100000, 1000000)}`,
    passengerId: input.passengerId,
    passengerName: input.passengerName.trim(),
    status: "Confirmed (demo)",
    createdAt: new Date().toISOString(),
  };
  data.bookings.push(booking);
  saveData(data);
  return booking;
}

export function listDemoBookings(passengerId: string): DemoBooking[] {
  return loadData().bookings
    .filter((booking) => booking.passengerId === passengerId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function createDemoSupportCase(input: {
  passengerId: unknown;
  passengerName: unknown;
  bookingReference?: unknown;
  flightNumber?: unknown;
  category: unknown;
  description: unknown;
}): DemoSupportCase {
  validatePassenger(input);
  if (typeof input.category !== "string" || !CASE_CATEGORIES.has(input.category as DemoSupportCase["category"])) {
    throw new DemoWorkflowValidationError("Choose a valid support case category.");
  }
  if (typeof input.description !== "string" || !input.description.trim() || input.description.trim().length > 4000) {
    throw new DemoWorkflowValidationError("A case summary of up to 4,000 characters is required.");
  }
  if (input.bookingReference !== undefined && (typeof input.bookingReference !== "string" || input.bookingReference.length > 40)) {
    throw new DemoWorkflowValidationError("The booking reference is invalid.");
  }
  if (input.flightNumber !== undefined && (typeof input.flightNumber !== "string" || input.flightNumber.length > 20)) {
    throw new DemoWorkflowValidationError("The flight number is invalid.");
  }

  const category = input.category as DemoSupportCase["category"];
  const supportCase: DemoSupportCase = {
    caseId: `DC-${randomInt(100000, 1000000)}`,
    passengerId: input.passengerId,
    passengerName: (input.passengerName as string).trim(),
    bookingReference: input.bookingReference as string | undefined,
    flightNumber: input.flightNumber as string | undefined,
    category,
    description: input.description.trim(),
    assignedQueue: QUEUES[category],
    status: "Created (demo only - not sent)",
    createdAt: new Date().toISOString(),
  };
  const data = loadData();
  data.cases.push(supportCase);
  saveData(data);
  return supportCase;
}

export function listDemoSupportCases(passengerId: string): DemoSupportCase[] {
  return loadData().cases
    .filter((supportCase) => supportCase.passengerId === passengerId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getDemoWorkflowCounts(): { bookings: number; cases: number; sensitiveCases: number } {
  const data = loadData();
  return {
    bookings: data.bookings.length,
    cases: data.cases.length,
    sensitiveCases: data.cases.filter((supportCase) => supportCase.category === "Sensitive escalation").length,
  };
}
