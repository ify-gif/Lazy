import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import Module from "node:module";

const require = createRequire(import.meta.url);
const workspaceRoot = resolve(process.cwd());
const tempUserDataDir = mkdtempSync(join(tmpdir(), "lazy-ipc-contract-"));

// Build server-side TS output used by DBService before loading it.
execSync("npx tsc --build tsconfig.server.json --force", {
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
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { DBService } = require("../dist-electron/dbService.js");

async function resetDbState() {
  await DBService.run("DELETE FROM work_stories");
  await DBService.run("DELETE FROM meetings");
}

test("DBService initializes with migration tracking table", async () => {
  await DBService.init();
  const rows = await DBService.all("SELECT id FROM schema_migrations ORDER BY id ASC");
  const ids = rows.map((row) => row.id);

  assert.ok(ids.includes("001_create_meetings"));
  assert.ok(ids.includes("002_create_work_stories"));
  assert.ok(ids.includes("003_add_work_stories_parent_id"));
  assert.ok(ids.includes("004_add_work_stories_title"));
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

test("updateWorkStoryTitle updates a story title", async () => {
  await resetDbState();

  const storyId = await DBService.saveWorkStory(
    "story",
    "overview text",
    "output markdown",
    undefined,
    "Original Title"
  );

  await DBService.updateWorkStoryTitle(storyId, "Renamed Title");
  const stories = await DBService.getWorkStories();
  assert.equal(stories[0].title, "Renamed Title");
});

test("comment linkage + deleteItem cascade removes child comments", async () => {
  await resetDbState();

  const storyId = await DBService.saveWorkStory(
    "story",
    "story overview",
    "story output",
    undefined,
    "Story For Comments"
  );
  await DBService.saveWorkStory("comment", "comment overview", "comment output", storyId);

  const commentsBefore = await DBService.getCommentsHelper(storyId);
  assert.equal(commentsBefore.length, 1);

  await DBService.deleteItem("work_stories", storyId);

  const storiesAfter = await DBService.getWorkStories();
  const commentsAfter = await DBService.getCommentsHelper(storyId);
  assert.equal(storiesAfter.length, 0);
  assert.equal(commentsAfter.length, 0);
});

test("saveMeeting + getMeetings contract remains valid", async () => {
  await resetDbState();

  await DBService.saveMeeting("Meeting Title", "Transcript", "Summary");
  const meetings = await DBService.getMeetings();

  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].title, "Meeting Title");
  assert.equal(meetings[0].transcript, "Transcript");
  assert.equal(meetings[0].summary, "Summary");
});

test.after(() => {
  if (DBService.db) {
    DBService.db.close();
    DBService.db = null;
  }
  Module._load = originalLoad;
  rmSync(tempUserDataDir, { recursive: true, force: true });
});

