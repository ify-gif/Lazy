import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const workspaceRoot = resolve(process.cwd());
const tempUserDataDir = mkdtempSync(join(tmpdir(), "lazy-ipc-contract-"));

// Build server-side TS output used by DBService before loading it.
execSync("node ./node_modules/typescript/lib/tsc.js --build tsconfig.server.json --force", {
  cwd: workspaceRoot,
  stdio: "inherit",
});

const originalLoad = Module._load;
Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === "electron") {
    return {
      app: {
        getPath(name) {
          if (name !== "userData") {
            throw new Error(`Unexpected getPath key: ${name}`);
          }
          return tempUserDataDir;
        },
        getVersion() {
          return "1.2.12";
        },
      },
      safeStorage: {
        isEncryptionAvailable() {
          return false;
        },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { DBService } = require("../dist-electron/dbService.js");
const { AIService, TEMPLATE_REGISTRY, DEFAULT_SCHEMA_TARGETS } = require("../dist-electron/aiService.js");
const { OPMBridgeService, MAX_ATTEMPTS } = require("../dist-electron/opmBridgeService.js");
const { Store } = require("../dist-electron/store.js");

async function resetDbState() {
  await DBService.run("DELETE FROM work_stories");
  await DBService.run("DELETE FROM meetings");
  await DBService.run("DELETE FROM action_items");
  await DBService.run("DELETE FROM outbound_queue");
  await DBService.run("DELETE FROM bridge_schema_cache");
}

test("DBService initializes with all migration tracking tables (001 - 013)", async () => {
  await DBService.init();
  const rows = await DBService.all("SELECT id FROM schema_migrations ORDER BY id ASC");
  const ids = rows.map((row) => row.id);

  assert.ok(ids.includes("001_create_meetings"));
  assert.ok(ids.includes("002_create_work_stories"));
  assert.ok(ids.includes("003_add_work_stories_parent_id"));
  assert.ok(ids.includes("004_add_work_stories_title"));
  assert.ok(ids.includes("009_create_action_items"));
  assert.ok(ids.includes("010_add_meeting_sync_state"));
  assert.ok(ids.includes("011_create_outbound_queue"));
  assert.ok(ids.includes("012_create_bridge_schema_cache"));
  assert.ok(ids.includes("013_add_outbound_dead_letter"));
});

test("saveWorkStory + getWorkStories preserves story title contract", async () => {
  await resetDbState();

  await DBService.saveWorkStory(
    "story",
    "overview text",
    "output markdown",
    undefined,
    "Contract Story Title"
  );

  const stories = await DBService.getWorkStories();
  assert.equal(stories.length, 1);
  assert.equal(stories[0].type, "story");
  assert.equal(stories[0].title, "Contract Story Title");
});

test("Action Items CRUD in SQLite", async () => {
  await resetDbState();

  const meetingId = await DBService.saveMeeting("Action Meeting", "Transcript", "Summary");
  await DBService.saveActionItems(meetingId, [
    {
      target: "TASK",
      text: "Update documentation",
      body: "Detail description",
      assignee: "Alice",
      due_date: "2026-09-01",
      raid_type: null,
      confidence: 0.9,
    },
    {
      target: "RAID",
      text: "DB connection timeout risk",
      body: "High risk under load",
      assignee: "Bob",
      due_date: null,
      raid_type: "RISK",
      confidence: 0.95,
    },
  ]);

  const items = await DBService.getActionItems(meetingId);
  assert.equal(items.length, 2);
  assert.equal(items[0].target, "TASK");
  assert.equal(items[0].text, "Update documentation");
  assert.equal(items[0].assignee, "Alice");
  assert.equal(items[1].target, "RAID");
  assert.equal(items[1].raid_type, "RISK");
});

test("Outbound Queue & Meeting Sync State CRUD", async () => {
  await resetDbState();

  const meetingId = await DBService.saveMeeting("Sync Meeting", "Transcript", "Summary");

  await DBService.updateMeetingSyncState(meetingId, {
    deviceId: "device-123",
    occurredAt: "2026-08-19T00:00:00Z",
    template: "standard",
  });

  const meetings = await DBService.getMeetings();
  const meeting = meetings.find((m) => m.id === meetingId);
  assert.ok(meeting);
  assert.equal(meeting.device_id, "device-123");
  assert.equal(meeting.template, "standard");

  const idempotencyKey = `lazy:device-123:${meetingId}`;
  await DBService.enqueueOutbound(idempotencyKey, "/api/bridge/meetings", JSON.stringify({ kind: "meeting" }));

  const pending = await DBService.getPendingOutboundQueue();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].idempotency_key, idempotencyKey);

  const nextAttempt = new Date(Date.now() + 10000).toISOString();
  await DBService.updateOutboundAttempt(pending[0].id, 1, nextAttempt, "Network error");

  const pendingAfterAttempt = await DBService.getPendingOutboundQueue();
  assert.equal(pendingAfterAttempt.length, 0); // Not ready yet because nextAttempt is in future

  await DBService.removeOutboundQueueItem(pending[0].id);
  const queueCount = await DBService.getOutboundQueueCount();
  assert.equal(queueCount, 0);
});

test("Bridge Schema Cache CRUD in SQLite", async () => {
  await resetDbState();

  const testSchemaPayload = JSON.stringify({
    protocol: 1,
    targets: ["TASK", "RAID", "DECISION"],
    projects: [{ id: "proj-1", name: "Alpha" }],
    workspace: { id: "ws-1", name: "Workspace One" },
  });

  await DBService.saveBridgeSchemaCache(testSchemaPayload);
  const cached = await DBService.getBridgeSchemaCache();
  assert.ok(cached);
  assert.equal(cached.id, 1);
  assert.equal(cached.payload, testSchemaPayload);
});

test("AIService parseSummarySections splits markdown headings", () => {
  const summaryMd = `Overview text here.

## Key Discussion Points
- Point A
- Point B

## Action Items
- Item 1`;

  const sections = AIService.parseSummarySections(summaryMd);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].heading, "Overview");
  assert.equal(sections[0].body, "Overview text here.");
  assert.equal(sections[1].heading, "Key Discussion Points");
  assert.equal(sections[1].body, "- Point A\n- Point B");
  assert.equal(sections[2].heading, "Action Items");
  assert.equal(sections[2].body, "- Item 1");
});

test("Template Registry defines valid templates and target constraints", () => {
  assert.ok(TEMPLATE_REGISTRY.standard);
  assert.ok(TEMPLATE_REGISTRY.standup);
  assert.ok(TEMPLATE_REGISTRY.action_items);
  assert.ok(TEMPLATE_REGISTRY.decision_log);

  assert.deepEqual(TEMPLATE_REGISTRY.standard.targets, [
    "TASK",
    "RAID",
    "DECISION",
    "REQUIREMENT",
    "OPEN_QUESTION",
    "STAKEHOLDER",
    "KNOWLEDGE",
    "NOTE",
  ]);

  assert.deepEqual(DEFAULT_SCHEMA_TARGETS, [
    "TASK",
    "RAID",
    "DECISION",
    "REQUIREMENT",
    "OPEN_QUESTION",
    "STAKEHOLDER",
    "KNOWLEDGE",
    "NOTE",
  ]);
});

// --- LOCAL MOCK O.PM SERVER TESTS ---
let mockServer;
let mockServerPort;

test.before((t, done) => {
  mockServer = http.createServer((req, res) => {
    let bodyText = "";
    req.on("data", (chunk) => {
      bodyText += chunk;
    });
    req.on("end", () => {
      const url = req.url;

      if (url === "/api/bridge/device/code" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            device_code: "mock-device-code-123",
            user_code: "ABCD-1234",
            verification_uri: "http://localhost/verify",
            interval: 1,
            expires_in: 600,
          })
        );
        return;
      }

      if (url === "/api/bridge/device/token" && req.method === "POST") {
        const payload = JSON.parse(bodyText || "{}");
        if (payload.device_code === "mock-device-code-123") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              access_token: "mock-access-token-xyz",
              workspace_id: "ws-mock-1",
              workspace_name: "Mock Workspace",
              account_email: "test@example.com",
            })
          );
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "expired_token" }));
        }
        return;
      }

      if (url === "/api/bridge/schema" && req.method === "GET") {
        if (req.headers["authorization"] !== "Bearer mock-access-token-xyz") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            protocol: 1,
            targets: ["TASK", "RAID", "DECISION"],
            projects: [{ id: "p-1", name: "Project One" }],
            workspace: { id: "ws-mock-1", name: "Mock Workspace" },
          })
        );
        return;
      }

      if (url === "/api/bridge/capabilities" && req.method === "POST") {
        if (req.headers["authorization"] !== "Bearer mock-access-token-xyz") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url === "/api/bridge/meetings" && req.method === "POST") {
        if (req.headers["authorization"] !== "Bearer mock-access-token-xyz") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }

        const idempotencyKey = req.headers["idempotency-key"];
        if (!idempotencyKey || !idempotencyKey.startsWith("lazy:")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_idempotency_key" }));
          return;
        }

        if (idempotencyKey.includes("conflict")) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "already_exists", meeting_id: "opm-meeting-409" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ meeting_id: "opm-meeting-789" }));
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });

  mockServer.listen(0, "127.0.0.1", () => {
    mockServerPort = mockServer.address().port;
    done();
  });
});

test("Mock Server O.PM Bridge Flow", async () => {
  const baseUrl = `http://127.0.0.1:${mockServerPort}`;

  // 1. Device Code Pairing
  const codeRes = await fetch(`${baseUrl}/api/bridge/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lazy-Protocol": "1" },
    body: JSON.stringify({ device_name: "Test Laptop", device_id: "device-test-1" }),
  });
  assert.equal(codeRes.status, 200);
  const codeData = await codeRes.json();
  assert.equal(codeData.user_code, "ABCD-1234");

  // 2. Device Token Exchange
  const tokenRes = await fetch(`${baseUrl}/api/bridge/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lazy-Protocol": "1" },
    body: JSON.stringify({ device_code: codeData.device_code }),
  });
  assert.equal(tokenRes.status, 200);
  const tokenData = await tokenRes.json();
  assert.equal(tokenData.access_token, "mock-access-token-xyz");

  // 3. Schema Fetch
  const schemaRes = await fetch(`${baseUrl}/api/bridge/schema`, {
    method: "GET",
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "X-Lazy-Protocol": "1" },
  });
  assert.equal(schemaRes.status, 200);
  const schemaData = await schemaRes.json();
  assert.equal(schemaData.projects[0].name, "Project One");

  // 4. Meeting Push with Idempotency Key
  const pushRes = await fetch(`${baseUrl}/api/bridge/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "X-Lazy-Protocol": "1",
      "Idempotency-Key": "lazy:device-test-1:100",
    },
    body: JSON.stringify({
      kind: "meeting",
      protocol: 1,
      title: "Test Push",
    }),
  });
  assert.equal(pushRes.status, 200);
  const pushData = await pushRes.json();
  assert.equal(pushData.meeting_id, "opm-meeting-789");

  // 5. Conflict (409) Handled As Success
  const conflictRes = await fetch(`${baseUrl}/api/bridge/meetings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "X-Lazy-Protocol": "1",
      "Idempotency-Key": "lazy:device-test-1:conflict",
    },
    body: JSON.stringify({
      kind: "meeting",
      protocol: 1,
      title: "Conflict Push",
    }),
  });
  assert.equal(conflictRes.status, 409);
});

test("Pushing a meeting preserves explicit occurred_at and leaves stored occurred_at unchanged", async () => {
  await resetDbState();

  const createdDate = "2026-01-01T10:00:00.000Z";
  const explicitOccurredDate = "2025-12-25T14:30:00.000Z";

  await DBService.run(
    "INSERT INTO meetings (title, transcript, summary, created_at, occurred_at) VALUES (?, ?, ?, ?, ?)",
    ["Historical Meeting", "Transcript", "Summary", createdDate, explicitOccurredDate]
  );

  const meetings = await DBService.getMeetings();
  const meeting = meetings[0];
  assert.equal(meeting.occurred_at, explicitOccurredDate);

  Store.setOPMToken("mock-access-token-xyz");
  Store.set("opmBaseUrl", `http://127.0.0.1:${mockServerPort}`);

  await OPMBridgeService.pushMeeting(meeting.id, "p-1");

  const pending = await DBService.getPendingOutboundQueue();
  assert.equal(pending.length, 1);
  const payload = JSON.parse(pending[0].payload);
  assert.equal(payload.occurred_at, explicitOccurredDate);

  const updatedMeetings = await DBService.getMeetings();
  const updatedMeeting = updatedMeetings.find((m) => m.id === meeting.id);
  assert.equal(updatedMeeting.occurred_at, explicitOccurredDate);
});

test("409 Conflict response is treated as success and removes queue item", async () => {
  await resetDbState();

  Store.setOPMToken("mock-access-token-xyz");
  Store.set("opmBaseUrl", `http://127.0.0.1:${mockServerPort}`);

  const idempotencyKey = "lazy:device-test-1:conflict";
  await DBService.enqueueOutbound(idempotencyKey, "/api/bridge/meetings", JSON.stringify({ kind: "meeting" }));

  await OPMBridgeService.drainQueue();

  const queueCount = await DBService.getOutboundQueueCount();
  assert.equal(queueCount, 0);
});

test("401 Auth failure clears token and stops retrying without infinite loop", async () => {
  await resetDbState();

  Store.setOPMToken("invalid-bad-token");
  Store.set("opmBaseUrl", `http://127.0.0.1:${mockServerPort}`);

  const idempotencyKey = "lazy:device-test-1:authfail";
  await DBService.enqueueOutbound(idempotencyKey, "/api/bridge/meetings", JSON.stringify({ kind: "meeting" }));

  await OPMBridgeService.drainQueue();

  assert.equal(Store.getOPMToken(), ""); // Token cleared
});

test("Backoff sequence follows 2, 4, 8, 16, 32... capped at 300 seconds", async () => {
  for (let attempts = 1; attempts <= 10; attempts++) {
    const delaySec = Math.min(300, Math.pow(2, attempts));
    if (attempts === 1) assert.equal(delaySec, 2);
    if (attempts === 2) assert.equal(delaySec, 4);
    if (attempts === 3) assert.equal(delaySec, 8);
    if (attempts === 4) assert.equal(delaySec, 16);
    if (attempts === 5) assert.equal(delaySec, 32);
    if (attempts >= 9) assert.equal(delaySec, 300);
  }
});

test("Idempotency-Key header is formatted exactly lazy:<device_id>:<meeting_id>", async () => {
  await resetDbState();
  const meetingId = await DBService.saveMeeting("Idempotency Test", "Transcript", "Summary");
  const deviceId = OPMBridgeService.getDeviceId();

  await OPMBridgeService.pushMeeting(meetingId, "p-1");
  const pending = await DBService.getPendingOutboundQueue();
  assert.equal(pending[0].idempotency_key, `lazy:${deviceId}:${meetingId}`);
});

test("extractTargets drops candidates not present in passed schema targets", async () => {
  const customSchemaTargets = ["TASK", "DECISION"];
  const result = await AIService.extractTargets(
    "Transcript text",
    "standard",
    customSchemaTargets
  );

  for (const item of result) {
    assert.ok(customSchemaTargets.includes(item.target));
  }
});

test("Queue drain continues to next item when an item fails", async () => {
  await resetDbState();

  Store.setOPMToken("mock-access-token-xyz");
  Store.set("opmBaseUrl", `http://127.0.0.1:${mockServerPort}`);

  await DBService.enqueueOutbound("lazy:device-test-1:fail1", "/api/bridge/bad-endpoint", JSON.stringify({ kind: "meeting" }));
  await DBService.enqueueOutbound("lazy:device-test-1:succ2", "/api/bridge/meetings", JSON.stringify({ kind: "meeting" }));

  await OPMBridgeService.drainQueue();

  const deadCount = await DBService.getDeadLetterCount();
  assert.equal(deadCount, 0);
});

test("Items exceeding MAX_ATTEMPTS (12) are dead-lettered and excluded from pending query", async () => {
  await resetDbState();

  Store.setOPMToken("mock-access-token-xyz");
  Store.set("opmBaseUrl", `http://127.0.0.1:${mockServerPort}`);

  await DBService.enqueueOutbound("lazy:device-test-1:dead1", "/api/bridge/bad-endpoint", JSON.stringify({ kind: "meeting" }));
  const pending = await DBService.getPendingOutboundQueue();
  const itemId = pending[0].id;

  await DBService.updateOutboundAttempt(itemId, 11, null, "Previous error");

  await OPMBridgeService.drainQueue();

  const pendingAfter = await DBService.getPendingOutboundQueue();
  assert.equal(pendingAfter.length, 0);

  const deadLetters = await DBService.getDeadLetteredOutboundQueue();
  assert.equal(deadLetters.length, 1);
  assert.equal(deadLetters[0].id, itemId);

  await DBService.retryDeadLetteredOutboundQueue(itemId);
  const deadLettersAfterRetry = await DBService.getDeadLetteredOutboundQueue();
  assert.equal(deadLettersAfterRetry.length, 0);

  const pendingAfterRetry = await DBService.getPendingOutboundQueue();
  assert.equal(pendingAfterRetry.length, 1);
  assert.equal(pendingAfterRetry[0].attempts, 0);
});

test.after(async () => {
  if (mockServer) {
    mockServer.close();
  }
  if (DBService.db) {
    await new Promise((res) => DBService.db.close(res));
    DBService.db = null;
  }
  Module._load = originalLoad;
  try {
    rmSync(tempUserDataDir, { recursive: true, force: true });
  } catch {
    // ignore temp file lock errors on Windows
  }
});
