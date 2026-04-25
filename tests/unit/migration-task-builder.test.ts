import { MigrationTaskBuilder } from "../../src/migrations/MigrationTaskBuilder";
import { TaskType } from "../../src/tasks/constants";

describe("MigrationTaskBuilder", () => {
  it("adds migration steps and builds a composite task", () => {
    const task = new MigrationTaskBuilder("migrate-to-2")
      .addMigrationStep({ reference: "1.0.0" })
      .addMigrationStep({ reference: "2.0.0", args: ["ctx"] })
      .build();

    expect(task.atomicity).toBe(TaskType.COMPOSITE);
    expect(task.steps).toHaveLength(2);
    expect(task.steps?.[0].classification).toBe("migration");
    expect(task.steps?.[0].input).toEqual({ reference: "1.0.0" });
    expect(task.steps?.[1].input).toEqual({ reference: "2.0.0", args: ["ctx"] });
  });
});
