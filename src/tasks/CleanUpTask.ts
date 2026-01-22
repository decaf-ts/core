import { TaskHandler } from "./TaskHandler";
import { TaskContext } from "./TaskContext";
import { type Repo } from "../repository/Repository";
import { repository } from "../repository/decorators";
import { TaskModel } from "./models/TaskModel";
import { task } from "./decorators";
import { Condition } from "../query/Condition";
import { TaskStatus } from "./constants";

export type CleanUpTaskInput =
  | {
      successfulExpiry: Date;
      failedExpiry: Date;
      cancelledExpiry: Date;
    }
  | Condition<TaskModel>;

@task("cleanup-task")
export class CleanUpTask extends TaskHandler<CleanUpTaskInput, TaskModel[]> {
  @repository(TaskModel)
  protected tasks!: Repo<TaskModel>;

  constructor() {
    super();
  }

  async run(input: CleanUpTaskInput, ctx: TaskContext): Promise<TaskModel[]> {
    const log = ctx.logger;

    try {
      let condition: Condition<TaskModel>;

      if (input instanceof Condition) {
        condition = input;
        log.info(`Starting task cleanup with custom condition`);
      } else {
        log.info(`Starting task cleanup with expiry dates`);

        const successCondition = Condition.attr<TaskModel>("status")
          .eq(TaskStatus.SUCCEEDED)
          .and(
            Condition.attr<TaskModel>("updatedAt").lte(input.successfulExpiry)
          );

        const failedCondition = Condition.attr<TaskModel>("status")
          .eq(TaskStatus.FAILED)
          .and(Condition.attr<TaskModel>("updatedAt").lte(input.failedExpiry));

        const cancelledCondition = Condition.attr<TaskModel>("status")
          .eq(TaskStatus.CANCELED)
          .and(
            Condition.attr<TaskModel>("updatedAt").lte(input.cancelledExpiry)
          );

        condition = successCondition.or(failedCondition).or(cancelledCondition);
      }

      log.info(`Querying tasks for cleanup`);
      const tasksToDelete = await this.tasks
        .select(["id"])
        .where(condition)
        .execute(ctx);

      if (tasksToDelete.length === 0) {
        log.info(`No tasks found for cleanup`);
        return [];
      }

      log.info(`Found ${tasksToDelete.length} tasks to delete`);

      const deleted = await this.tasks.deleteAll(
        tasksToDelete.map((t) => t.id),
        ctx
      );

      log.info(`Successfully deleted ${deleted.length} tasks`);
      log.debug(`deleted tasks:`, deleted as any);
      return deleted;
    } catch (e: unknown) {
      log.error(`Error during task cleanup`, e as Error);
      throw e;
    }
  }
}
