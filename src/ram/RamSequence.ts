import { Sequence as Seq } from "./model/RamSequence";
import { InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { Sequence } from "../persistence";
import { SequenceOptions } from "../interfaces";
import { RamAdapter } from "./RamAdapter";
import { Repo, Repository } from "../repository";

export class RamSequence extends Sequence {
  protected repo: Repo<Seq>;

  constructor(options: SequenceOptions, adapter: RamAdapter) {
    super(options);
    this.repo = Repository.forModel(Seq, adapter.alias);
  }

  async current(): Promise<string | number | bigint> {
    const { name, startWith } = this.options;
    try {
      const sequence: Seq = await this.repo.read(name as string);
      return this.parse(sequence.current as string | number);
    } catch (e: any) {
      if (e instanceof NotFoundError) {
        if (typeof startWith === "undefined")
          throw new InternalError(
            "Starting value is not defined for a non existing sequence"
          );
        try {
          return this.parse(startWith);
        } catch (e: any) {
          throw new InternalError(
            `Failed to parse initial value for sequence ${startWith}: ${e}`
          );
        }
      }
      throw new InternalError(
        `Failed to retrieve current value for sequence ${name}: ${e}`
      );
    }
  }

  private parse(value: string | number | bigint): string | number | bigint {
    return Sequence.parseValue(this.options.type, value);
  }

  private async increment(
    current: string | number | bigint,
    count?: number
  ): Promise<string | number | bigint> {
    const { type, incrementBy, name } = this.options;
    let next: string | number | bigint;
    const toIncrementBy = count || incrementBy;
    if (toIncrementBy % incrementBy !== 0)
      throw new InternalError(
        `Value to increment does not consider the incrementBy setting: ${incrementBy}`
      );
    switch (type) {
      case "Number":
        next = (this.parse(current) as number) + toIncrementBy;
        break;
      case "BigInt":
        next = (this.parse(current) as bigint) + BigInt(toIncrementBy);
        break;
      default:
        throw new InternalError("Should never happen");
    }
    let seq: Seq;
    const repo = this.repo.override({
      ignoredValidationProperties: ["updatedOn"],
    });
    try {
      seq = await repo.update(new Seq({ id: name, current: next }));
    } catch (e: any) {
      if (!(e instanceof NotFoundError)) {
        throw e;
      }
      seq = await repo.create(new Seq({ id: name, current: next }));
    }

    return seq.current as string | number | bigint;
  }

  async next(): Promise<number | string | bigint> {
    const current = await this.current();
    return this.increment(current);
  }

  async range(count: number): Promise<(number | string | bigint)[]> {
    const current = (await this.current()) as number;
    const incrementBy = this.parse(this.options.incrementBy) as number;
    const next: string | number | bigint = await this.increment(
      current,
      (this.parse(count) as number) * incrementBy
    );
    const range: (number | string | bigint)[] = [];
    for (let i: number = 1; i <= count; i++) {
      range.push(current + incrementBy * (this.parse(i) as number));
    }
    if (range[range.length - 1] !== next)
      throw new InternalError("Miscalculation of range");
    return range;
  }
}

