import { MigrationService } from "../../src/migrations/MigrationService";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import { TaskStatus } from "../../src/tasks/constants";

class ControlledMigrationService extends MigrationService<any> {
  plan: any[] = [];

  protected override buildExecutionPlan(): any[] {
    return this.plan;
  }

  protected override buildMigrationTaskForPlan(): TaskModel {
    return new TaskModel({
      classification: "migration-composite",
      maxAttempts: 1,
      backoff: {
        baseMs: 1000,
        maxMs: 2000,
        strategy: "exponential",
        jitter: "full",
      } as any,
      atomicity: "composite" as any,
      status: "pending" as any,
      steps: [],
    });
  }
}

describe("MigrationService task mode hops and retry", () => {
  it("creates one migration task per version hop and chains them by dependency", async () => {
    const pushed: TaskModel[] = [];
    const push = jest.fn(async (task: TaskModel) => {
      const id = `task-${pushed.length + 1}`;
      const created = new TaskModel({ ...task, id });
      pushed.push(created);
      return created;
    });

    const service = new ControlledMigrationService();
    service.plan = [
      { reference: "1.0.1-a", version: "1.0.1" },
      { reference: "1.0.1-b", version: "1.0.1" },
      { reference: "1.0.2-a", version: "1.0.2" },
    ];

    await service.boot({
      taskMode: true,
      taskService: { push } as any,
    } as any);
    await service.migrateViaTasks();

    expect(push).toHaveBeenCalledTimes(2);
    expect(pushed[0].dependencies || []).toHaveLength(0);
    expect(pushed[1].dependencies).toEqual(
      expect.arrayContaining([pushed[0].id])
    );
  });

  it("retries failed queued migration task in task mode", async () => {
    const push = jest.fn(async () =>
      new TaskModel({
        id: "task-1",
        classification: "migration-composite",
        maxAttempts: 1,
        backoff: {
          baseMs: 1000,
          maxMs: 2000,
          strategy: "exponential",
          jitter: "full",
        } as any,
        atomicity: "composite" as any,
        status: "pending" as any,
      })
    );

    const update = jest.fn(async (task: TaskModel) => task);
    const track = jest.fn(async () => ({
      task: new TaskModel({
        id: "task-1",
        classification: "migration-composite",
        status: TaskStatus.FAILED as any,
      }),
      tracker: { wait: jest.fn() },
    }));

    const service = new ControlledMigrationService();
    service.plan = [{ reference: "1.0.1-a", version: "1.0.1" }];

    await service.boot({
      taskMode: true,
      taskService: { push, track, client: { tasks: { update } } } as any,
    } as any);
    await service.migrateViaTasks();
    await service.retry();

    expect(track).toHaveBeenCalledWith("task-1", expect.anything());
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "task-1",
        status: TaskStatus.PENDING,
      }),
      expect.anything()
    );
  });
});
