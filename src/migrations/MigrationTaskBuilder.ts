import { CompositeTaskBuilder } from "../tasks/builder";
import { TaskModel } from "../tasks/models/TaskModel";
import { MigrationStepInput } from "./MigrationTasks";

export class MigrationTaskBuilder {
  protected readonly builder: CompositeTaskBuilder;

  constructor(name = "migration-task") {
    this.builder = new CompositeTaskBuilder()
      .setClassification("migration-composite")
      .setName(name)
      .setMaxAttempts(1);
  }

  addMigrationStep(step: MigrationStepInput): this {
    this.builder.addStep("migration", step);
    return this;
  }

  addStep(classification: string, input?: any): this {
    this.builder.addStep(classification, input);
    return this;
  }

  build(): TaskModel {
    return this.builder.build();
  }
}

