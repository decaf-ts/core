import {
  AnyFunction,
  Logger,
  LoggingConfig,
  LogLevel,
  LogMeta,
  StringLike,
  style,
  StyledString,
} from "@decaf-ts/logging";
import { EventPipe, LogPipe, LogPipeOptions } from "./types";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskEventType, TaskStatus } from "./constants";
import { InternalError } from "@decaf-ts/db-decorators";

export class TaskLogger<LOG extends Logger> implements Logger {
  protected history: [LogLevel, string, any][] = [];

  constructor(
    protected logger: Logger,
    protected bufferSize: number = 150,
    protected maxBufferSize: number = 300,
    protected pipe?: LogPipe
  ) {
    Object.values(LogLevel).forEach((level) => {
      (this as any)[level] = new Proxy(this[level], {
        apply: (target, thisArg, argArray) => {
          target.apply(thisArg, argArray as [string, any]);
          thisArg.push(level, ...argArray);
        },
      });
    });
  }

  push(level: LogLevel, string: string, meta?: any) {
    if (this.history.length >= this.maxBufferSize)
      this.history.splice(0, this.history.length - this.bufferSize);
    this.history.push([level, string, meta]);
  }

  flush<PIPE extends LogPipe>(
    pipe?: PIPE
  ): PIPE extends LogPipe
    ? Promise<[LogLevel, string, any][]>
    : [LogLevel, string, any][] {
    const result = this.history;
    this.history = [];
    if (pipe && result.length)
      return pipe(result)
        .catch((e) => this.logger.error(`Failed to pipe logs`, e))
        .finally(() => (this.history = [])) as any;

    this.history = [];
    return result as any;
  }

  readonly root: string[] = this.logger.root;

  benchmark(msg: StringLike): void {
    return this.logger.benchmark(msg);
  }

  clear(): this {
    this.logger = this.logger.clear();
    return this;
  }

  debug(msg: StringLike, meta?: LogMeta): void {
    this.logger.debug(msg, meta);
  }

  error(msg: StringLike | Error, e?: Error | LogMeta, meta?: LogMeta): void {
    this.logger.error(msg, e, meta);
  }

  for(config: Partial<LoggingConfig>): this;
  for(
    context: string | { new (...args: any[]): any } | AnyFunction | object
  ): this;
  for(
    method:
      | string
      | {
          new (...args: any[]): any;
        }
      | AnyFunction
      | object
      | Partial<LoggingConfig>,
    config?: Partial<LoggingConfig>,
    ...args: any[]
  ): this;
  for(
    config:
      | Partial<LoggingConfig>
      | string
      | {
          new (...args: any[]): any;
        }
      | AnyFunction
      | object,
    ...args: any[]
  ): TaskLogger<LOG> {
    return new Proxy(this, {
      get(target: TaskLogger<LOG>, p: string | symbol): any {
        if (p === "logger") return Reflect.get(target, p).for(config, ...args);
        return Reflect.get(target, p);
      },
    });
  }

  info(msg: StringLike, meta?: LogMeta): void {
    this.logger.info(msg, meta);
  }

  setConfig(config: Partial<LoggingConfig>): void {
    this.logger.setConfig(config);
  }

  silly(msg: StringLike, meta?: LogMeta): void {
    this.logger.silly(msg, meta);
  }

  trace(msg: StringLike, meta?: LogMeta): void {
    this.logger.trace(msg, meta);
  }

  verbose(msg: StringLike, verbosity?: number | LogMeta, meta?: LogMeta): void {
    this.logger.verbose(msg, verbosity, meta);
  }

  warn(msg: StringLike, meta?: LogMeta): void {
    this.logger.warn(msg, meta);
  }
}

export function getLogPipe<LOG extends Logger>(
  log: LOG,
  opts: LogPipeOptions = { logProgress: true, logStatus: true, style: true }
): EventPipe {
  return async function logPipe(evt: TaskEventModel) {
    log = log.for(evt.taskId, {
      style: false,
      timestamp: false,
      logLevel: false,
    });

    switch (evt.classification) {
      case TaskEventType.LOG: {
        const logs: [LogLevel, string, any][] = evt.payload;
        // eslint-disable-next-line prefer-const
        for (let [level, msg, payload] of logs) {
          if (!opts.style) {
            msg = style(msg) as any;
            msg = (msg as unknown as StyledString).clear().toString();
          }

          const args: [string, any?] = [msg];
          switch (level) {
            case LogLevel.verbose:
              args.push(1);
            // eslint-disable-next-line no-fallthrough
            default:
              args.push(payload);
          }
          try {
            log[level](...args);
          } catch (e: unknown) {
            log.error(`Failed to pipe task logs`, e as Error);
          }
        }
        break;
      }
      case TaskEventType.PROGRESS: {
        if (opts.logProgress) {
          const { currentStep, totalSteps } = evt.payload;
          log.info(`### STEP ${currentStep}/${totalSteps}`);
        }
        break;
      }
      case TaskEventType.STATUS: {
        if (opts.logStatus) {
          const statusValue = evt.payload?.status ?? evt.payload;
          let status = style(statusValue);
          switch (statusValue) {
            case TaskStatus.SUCCEEDED:
              status = status.green.bold;
              break;
            case TaskStatus.RUNNING:
              status = status.blue.bold;
              break;
            case TaskStatus.PENDING:
              status = status.yellow;
              break;
            case TaskStatus.WAITING_RETRY:
              status = status.yellow.bold;
              break;
            case TaskStatus.FAILED:
              status = status.red.bold;
              break;
            case TaskStatus.CANCELED:
              status = status.magenta.bold;
              break;
            case TaskStatus.SCHEDULED:
              status = status.cyan;
              break;
            default:
              throw new InternalError(
                `Received unknown task status: ${evt.payload}`
              );
          }
          log.info(`### STATUS ${status}`);
        }
        break;
      }
      default:
        throw new InternalError(
          `Unknown task event classification: ${evt.classification}`
        );
    }
  };
}
