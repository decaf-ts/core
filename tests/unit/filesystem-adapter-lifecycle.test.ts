/**
 * FilesystemAdapter lifecycle: its file watchers are connections too — shutdown
 * must stop them (and their pending refresh timers), a stop racing a start must
 * not leave watchers behind, and initialize() after shutdown resumes watching.
 */
import { EventEmitter } from "node:events";

// fs.watch needs inotify instances, which developer machines often run out of;
// the watchers only need to exist and be closable here.
jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs");
  return {
    ...actual,
    watch: jest.fn(() => {
      const watcher = new EventEmitter() as EventEmitter & { close: () => void };
      watcher.close = jest.fn();
      return watcher;
    }),
  };
});

import "../../src/overrides";
import { FilesystemAdapter } from "../../src/fs";
import { TempFsHandle, createTempFs } from "./fs/tempFs";

let aliasSeq = 0;

const state = (adapter: FilesystemAdapter) => ({
  watching: (adapter as any).watching as boolean,
  root: Boolean((adapter as any).rootWatcher),
  tables: ((adapter as any).tableWatchers as Map<string, unknown>).size,
});

describe("FilesystemAdapter lifecycle", () => {
  let temp: TempFsHandle;
  const adapters: FilesystemAdapter[] = [];

  const create = () => {
    const adapter = new FilesystemAdapter(
      { user: "tester", rootDir: temp.root },
      `fs-lifecycle-${++aliasSeq}`
    );
    adapters.push(adapter);
    return adapter;
  };

  beforeAll(async () => {
    temp = await createTempFs();
  });

  afterEach(async () => {
    for (const adapter of adapters.splice(0)) await adapter.shutdown();
  });

  afterAll(async () => {
    await temp.cleanup();
  });

  it("shutdown stops the filesystem watchers", async () => {
    const adapter = create();
    await adapter.initialize();
    expect(state(adapter)).toEqual(expect.objectContaining({ watching: true, root: true }));

    await adapter.shutdown();
    expect(state(adapter)).toEqual({ watching: false, root: false, tables: 0 });
  });

  it("a stop racing the watchers' start leaves no watcher behind", async () => {
    const adapter = create();
    const starting = adapter.ensureWatching();
    adapter.stopWatching();
    await starting;
    expect(state(adapter)).toEqual({ watching: false, root: false, tables: 0 });
  });

  it("initialize() after shutdown resumes watching", async () => {
    const adapter = create();
    await adapter.initialize();
    await adapter.shutdown();

    await adapter.initialize();
    expect(state(adapter)).toEqual(expect.objectContaining({ watching: true, root: true }));
  });
});
