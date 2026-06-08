import { TaskModel } from "./models/TaskModel";
import {
  BackoffStrategy,
  JitterStrategy,
  TaskStatus,
  TaskType,
} from "./constants";
import { TaskBackoffModel } from "./models/index";
import { TaskStepSpecModel } from "./models/TaskStepSpecModel";
import {
  gt,
  list,
  min,
  Model,
  ModelArg,
  option,
  required,
} from "@decaf-ts/decorator-validation";
import { InternalError, ValidationError } from "@decaf-ts/db-decorators";
import { prop } from "@decaf-ts/decoration";

export class TaskBackoffBuilder<NESTED extends boolean = false> extends Model {
  @required()
  @min(1000)
  baseMs: number = 1000;
  @required()
  @option(JitterStrategy)
  jitter: JitterStrategy = JitterStrategy.FULL;
  @gt("baseMs")
  @min(1000)
  @required()
  maxMs: number = 60_000;
  @required()
  @option(BackoffStrategy)
  strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL;

  constructor(arg?: ModelArg<TaskBackoffBuilder>) {
    super(arg);
    Model.fromModel(this, arg);
  }

  setBaseMs(value: number): this {
    this.baseMs = value;
    return this;
  }

  setJitter(value: JitterStrategy): this {
    this.jitter = value;
    return this;
  }

  setMaxMs(value: number): this {
    this.maxMs = value;
    return this;
  }

  setStrategy(value: BackoffStrategy): this {
    this.strategy = value;
    return this;
  }

  build(): NESTED extends false ? TaskBackoffModel : TaskBuilder {
    const errs = this.hasErrors();
    if (errs) throw new ValidationError(errs);
    return new TaskBackoffModel(this) as any;
  }
}

export class TaskBuilder extends Model {
  @required()
  protected classification!: string;
  @prop()
  protected name?: string;
  @required()
  protected status: TaskStatus = TaskStatus.PENDING;
  @required()
  protected atomicity: TaskType = TaskType.ATOMIC;
  @required()
  protected backoff: TaskBackoffModel = new TaskBackoffModel();
  @prop()
  protected input?: any;
  @prop()
  protected lock?: string;
  @prop()
  @list(() => String)
  protected dependencies?: string[];
  @min(1)
  @required()
  protected maxAttempts: number = 1;

  setClassification(value: string): this {
    this.classification = value;
    return this;
  }

  setName(value: string): this {
    this.name = value;
    return this;
  }

  setAtomicity(value: TaskType): this {
    this.atomicity = value;
    return this;
  }

  setBackoff<V extends TaskBackoffModel>(
    value?: TaskBackoffModel
  ): V extends TaskBackoffModel ? this : TaskBackoffBuilder<true> {
    if (value) {
      this.backoff = value;
      return this as any;
    }
    const backOff = new TaskBackoffBuilder();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    backOff.build = new Proxy(backOff.build, {
      apply(target, thisArg, args) {
        self.backoff = Reflect.apply(target, thisArg, args);
        return self;
      },
    });
    return backOff as any;
  }

  setInput(value: any): this {
    this.input = value;
    return this;
  }

  setLock(value?: string): this {
    this.lock = value;
    return this;
  }

  setDependencies(value?: string[]): this {
    this.dependencies = value;
    return this;
  }

  setDependsOn(value?: string[]): this {
    return this.setDependencies(value);
  }

  setMaxAttempts(value: number): this {
    this.maxAttempts = value;
    return this;
  }

  constructor(arg?: ModelArg<TaskBuilder>) {
    super(arg);
    Model.fromModel(this, arg);
  }

  build() {
    const errs = this.hasErrors();
    if (errs) throw new ValidationError(errs);
    return new TaskModel(this);
  }
}

export class TaskStepSpecBuilder {
  constructor(
    protected parent: CompositeTaskBuilder,
    protected step: TaskStepSpecModel
  ) {}

  setClassification(value: string): this {
    this.step.classification = value;
    return this;
  }

  setName(value?: string): this {
    this.step.name = value;
    return this;
  }

  setInput(value: any): this {
    this.step.input = value;
    return this;
  }

  setLock(value?: string): this {
    this.step.lock = value;
    return this;
  }

  setDependsOn(value?: string[]): this {
    this.step.dependsOn = value;
    return this;
  }

  setMaxAttempts(value?: number): this {
    this.step.maxAttempts = value;
    return this;
  }

  setBackoff(value?: TaskBackoffModel): this {
    this.step.backoff = value;
    return this;
  }

  addStep(classification: string): TaskStepSpecBuilder;
  addStep(classification: string, input: any): CompositeTaskBuilder;
  addStep(
    classification: string,
    name: string,
    input?: any
  ): CompositeTaskBuilder;
  addStep(
    classification: string,
    nameOrInput?: any,
    inputMaybe?: any
  ): CompositeTaskBuilder | TaskStepSpecBuilder {
    return this.parent.addStep(classification, nameOrInput, inputMaybe);
  }

  setSteps(value: TaskStepSpecModel[]): CompositeTaskBuilder {
    return this.parent.setSteps(value);
  }

  build(): CompositeTaskBuilder {
    return this.parent;
  }
}

export class CompositeTaskBuilder extends TaskBuilder {
  @list(() => TaskStepSpecModel)
  protected steps?: TaskStepSpecModel[];

  protected stepResults?: TaskStepSpecModel[] = [];

  constructor(arg?: ModelArg<CompositeTaskBuilder>) {
    super(arg);
    Model.fromModel(this, arg);
    this.atomicity = TaskType.COMPOSITE;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override setAtomicity(value: TaskType): this {
    throw new InternalError(`Atomicity locked to ${TaskType.COMPOSITE}`);
  }

  setSteps(value: TaskStepSpecModel[]): this {
    this.steps = (value ?? []).map((step) =>
      step instanceof TaskStepSpecModel ? step : new TaskStepSpecModel(step)
    );
    return this;
  }

  /**
   * Backwards compatible:
   * - addStep(classification, input?)
   * - addStep(classification, name, input?)
   *
   * When called with only `classification`, returns a TaskStepSpecBuilder so
   * callers can configure the step and then `.build()` back to this builder.
   */
  addStep(classification: string): TaskStepSpecBuilder;
  addStep(classification: string, input: any): this;
  addStep(classification: string, name: string, input?: any): this;
  addStep(
    classification: string,
    nameOrInput?: any,
    inputMaybe?: any
  ): this | TaskStepSpecBuilder {
    this.steps = this.steps || [];
    const now = new Date();
    const hasOnlyClassification = arguments.length === 1;
    const hasThirdArg = arguments.length >= 3;
    const name =
      hasThirdArg && typeof nameOrInput === "string" ? nameOrInput : undefined;
    const input = hasThirdArg
      ? inputMaybe
      : hasOnlyClassification
        ? undefined
        : nameOrInput;
    const step = new TaskStepSpecModel({
      classification,
      name,
      input,
      createdAt: now,
      updatedAt: now,
    });
    this.steps.push(step);
    if (hasOnlyClassification) return new TaskStepSpecBuilder(this, step);
    return this;
  }
}
