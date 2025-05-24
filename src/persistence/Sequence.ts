import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { sequenceNameForModel } from "../identity/utils";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { InternalError } from "@decaf-ts/db-decorators";
import { Logger, Logging } from "@decaf-ts/logging";

export abstract class Sequence {
  private logger!: Logger;

  protected get log() {
    if (!this.logger) this.logger = Logging.for(this as any);
    return this.logger;
  }

  protected constructor(protected readonly options: SequenceOptions) {}

  abstract next(): Promise<string | number | bigint>;
  abstract current(): Promise<string | number | bigint>;
  abstract range(count: number): Promise<(number | string | bigint)[]>;

  static pk<M extends Model>(model: M | Constructor<M>) {
    return sequenceNameForModel(model, "pk");
  }

  static parseValue(
    type: "Number" | "BigInt" | undefined,
    value: string | number | bigint
  ): string | number | bigint {
    switch (type) {
      case "Number":
        return typeof value === "string"
          ? parseInt(value)
          : typeof value === "number"
            ? value
            : BigInt(value);
      case "BigInt":
        return BigInt(value);
      default:
        throw new InternalError("Should never happen");
    }
  }
}
