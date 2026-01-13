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
import { ValidationError } from "@decaf-ts/db-decorators";
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
  protected id!: string;
  @required()
  protected classification!: string;
  @required()
  protected status: TaskStatus = TaskStatus.PENDING;
  @required()
  protected atomicity: TaskType = TaskType.ATOMIC;
  @required()
  protected backoff: TaskBackoffModel = new TaskBackoffModel();
  @prop()
  protected input?: any;

  @min(0)
  @required()
  protected attempt: number = 0;
  @min(1)
  @required()
  protected maxAttempts: number = 1;

  setClassification(value: string): this {
    this.classification = value;
    return this;
  }

  setStatus(value: TaskStatus): this {
    this.status = value;
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

  setMaxAttempts(value: number): this {
    this.maxAttempts = value;
    return this;
  }

  setAttempt(value: number): this {
    this.attempt = value;
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

export class CompositeTaskBuilder extends TaskBuilder {
  @list(() => TaskStepSpecModel)
  protected steps?: TaskStepSpecModel[];

  protected stepResults?: TaskStepSpecModel[] = [];

  constructor(arg?: ModelArg<CompositeTaskBuilder>) {
    super(arg);
    Model.fromModel(this, arg);
  }

  setSteps(value: TaskStepSpecModel[]): this {
    this.steps = value;
    return this;
  }

  addStep(classification: string, input?: any): this {
    this.steps = this.steps || [];
    this.steps.push(
      new TaskStepSpecModel({
        classification,
        input,
      })
    );
    return this;
  }
}
