import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  deserializeId,
  encodeId,
  readJsonFile,
  serializeId,
  writeJsonAtomic,
} from "../../../src/fs/helpers";

describe("fs helpers", () => {
  it("round-trips serialized primary keys", () => {
    const serialized = serializeId(42);
    expect(serialized.type).toBe("number");
    expect(deserializeId(serialized)).toBe(42);

    const big = serializeId(BigInt(99));
    expect(big.type).toBe("bigint");
    expect(deserializeId(big)).toBe(BigInt(99));

    const str = serializeId("abc");
    expect(str.type).toBe("string");
    expect(deserializeId(str)).toBe("abc");
  });

  it("encodes identifiers for filenames safely", () => {
    const encoded = encodeId("user@tenant/1");
    expect(encoded).not.toContain("/");
    expect(encoded).toContain("%40");
  });

  it("writes JSON atomically with formatting", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "decaf-helper-"));
    const file = path.join(dir, "payload.json");
    const payload = { id: "user-1", nested: { value: 1 } };
    await writeJsonAtomic(fs, file, payload, 2);
    const stored = await readJsonFile<typeof payload>(fs, file);
    expect(stored).toEqual(payload);
    const contents = await fs.readFile(file, "utf8");
    expect(contents).toContain('\n  "nested"');
    await fs.rm(dir, { recursive: true, force: true });
  });
});
