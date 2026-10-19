import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const storeFile = path.join(os.tmpdir(), `gulf-air-demo-workflows-${process.pid}.json`);
process.env.DEMO_WORKFLOWS_FILE = storeFile;

const {
  createDemoBooking,
  createDemoSupportCase,
  DemoWorkflowValidationError,
  getDemoWorkflowCounts,
  listDemoBookings,
  listDemoSupportCases,
  searchDemoFlights,
} = await import("./demo-workflows.js");

beforeEach(() => {
  fs.rmSync(storeFile, { force: true });
});

after(() => {
  fs.rmSync(storeFile, { force: true });
  fs.rmSync(`${storeFile}.${process.pid}.tmp`, { force: true });
});

test("search returns sample options with route-based duration and passenger totals", () => {
  const search = {
    origin: "BAH",
    destination: "LHR",
    departureDate: "2027-05-12",
    passengers: 2,
    cabin: "Economy" as const,
  };
  const flights = searchDemoFlights(search);
  const shorterRoute = searchDemoFlights({ ...search, destination: "DXB" });

  assert.equal(flights.length, 3);
  assert.ok(flights[0].duration.startsWith("6h"));
  assert.ok(shorterRoute[0].duration.startsWith("1h"));
  assert.equal(flights[0].totalPrice, flights[0].pricePerPassenger * search.passengers);
});

test("confirmed demo bookings are persisted and scoped to their passenger profile", () => {
  const [flight] = searchDemoFlights({
    origin: "BAH",
    destination: "LHR",
    departureDate: "2027-05-12",
    passengers: 1,
    cabin: "Economy",
  });
  const booking = createDemoBooking({
    passengerId: "demo-passenger",
    passengerName: "Demo Passenger",
    flight,
  });

  assert.match(booking.bookingReference, /^GD\d{6}$/);
  assert.equal(booking.status, "Confirmed (demo)");
  assert.equal(listDemoBookings("demo-passenger").length, 1);
  assert.equal(listDemoBookings("another-passenger").length, 0);
  assert.equal(fs.existsSync(storeFile), true);
});

test("sensitive support cases receive a simulated escalation queue", () => {
  const supportCase = createDemoSupportCase({
    passengerId: "demo-passenger",
    passengerName: "Demo Passenger",
    category: "Sensitive escalation",
    description: "Customer requested review of a sensitive issue.",
  });

  assert.equal(supportCase.assignedQueue, "Demo sensitive case escalation queue");
  assert.equal(supportCase.status, "Created (demo only - not sent)");
  assert.equal(listDemoSupportCases("demo-passenger")[0].caseId, supportCase.caseId);
  assert.equal(listDemoSupportCases("another-passenger").length, 0);
  assert.deepEqual(getDemoWorkflowCounts(), { bookings: 0, cases: 1, sensitiveCases: 1 });
});

test("invalid searches and incomplete support cases fail explicitly", () => {
  assert.throws(
    () => searchDemoFlights({
      origin: "BAH",
      destination: "BAH",
      departureDate: "2027-02-30",
      passengers: 2,
      cabin: "Economy",
    }),
    DemoWorkflowValidationError,
  );
  assert.throws(
    () => createDemoSupportCase({
      passengerId: "demo-passenger",
      passengerName: "Demo Passenger",
      category: "Refund",
      description: " ",
    }),
    DemoWorkflowValidationError,
  );
});
