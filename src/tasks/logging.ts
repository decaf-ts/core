import {
  AnyFunction,
  Logger,
  LoggingConfig,
  LogLevel,
  LogMeta,
  StringLike,
} from "@decaf-ts/logging";
import { LogPipe } from "./types";

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
          thisArg.push(...argArray);
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
    if (pipe)
      return pipe(result).catch((e) =>
        this.logger.error(`Failed to pipe logs`, e)
      ) as any;

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
