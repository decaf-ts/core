import "../../src/index";
import "../../src/overrides/index";
import { RamAdapter } from "../../src/ram";
import { Repository } from "../../src/repository";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import { TaskBuilder } from "../../src/tasks/builder";
import { TaskStatus } from "../../src/tasks/constants";
import { Condition } from "../../src/query/Condition";
import { Model } from "@decaf-ts/decorator-validation";

/**
 * Writes clear a property with an explicit `null` (stored as NULL); reads
 * expose a cleared property as `undefined`, like one never set.
 */
describe("cleared (null) properties", () => {
  it("are stored as null and read back as undefined", async () => {
    const adapter = new RamAdapter();
    const repo = Repository.forModel(TaskModel, adapter.alias);
    const created = await repo.create(
      new TaskBuilder().setClassification("x").setInput({ a: 1 }).setMaxAttempts(3).build()
    );
    const running = await repo.update(
      new TaskModel({
        ...created,
        status: TaskStatus.RUNNING,
        leaseOwner: "w",
        leaseExpiry: new Date(Date.now() + 5000),
      })
    );
    expect(running.leaseOwner).toBe("w");

    const done = new TaskModel({ ...running, status: TaskStatus.SUCCEEDED });
    (done as any).leaseOwner = null;
    (done as any).leaseExpiry = null;
    const updated = await repo.update(done);
    expect(updated.leaseOwner).toBeUndefined();
    expect(updated.leaseExpiry).toBeUndefined();

    // The stored record holds the clear (not the old value).
    const table = (adapter as any).client.get(Model.tableName(TaskModel));
    const stored = table.get(created.id);
    expect(stored["leaseOwner"]).toBeNull();

    for (const read of [
      await repo.read(created.id),
      (await repo.readAll([created.id]))[0],
      (await repo.select().where(Condition.attribute<TaskModel>("id").eq(created.id)).execute())[0],
    ]) {
      expect(read.status).toBe(TaskStatus.SUCCEEDED);
      expect(read.leaseOwner).toBeUndefined();
      expect(read.leaseExpiry).toBeUndefined();
      expect("leaseOwner" in read && read.leaseOwner === null).toBe(false);
    }

    // A later update that does not mention the lease leaves it cleared.
    const again = await repo.update(new TaskModel({ ...(await repo.read(created.id)), attempt: 1 }));
    expect(again.attempt).toBe(1);
    expect(again.leaseOwner).toBeUndefined();
  });
});
