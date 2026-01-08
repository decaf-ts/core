import { ITaskHandler } from "./types";
import { InternalError } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";

export class TaskHandlerRegistry {
  private readonly handlers = new Map<string, ITaskHandler>();

  constructor() {
    this.initialize();
  }

  protected initialize() {
    const preRegisteredHandlers = Metadata.tasks();
    if (preRegisteredHandlers) {
      Object.entries(preRegisteredHandlers).forEach(([key, handler]) => {
        let h: ITaskHandler;
        try {
          h = new handler();
        } catch (e: unknown) {
          throw new InternalError(
            `Failed to initialize handler with key ${key}: ${e}`
          );
        }

        this.register(h);
      });
    }
  }

  register(handler: ITaskHandler): void {
    if (this.handlers.has(handler.type))
      throw new InternalError(`Duplicate task handler: ${handler.type}`);
    this.handlers.set(handler.type, handler);
  }

  get(type: string): ITaskHandler | undefined {
    return this.handlers.get(type);
  }
}
