import { Sequence } from "../interfaces/Sequence";
import { InternalError, NotFoundError } from "../repository/errors";
import { Constructor, sf } from "@decaf-ts/decorator-validation";
import { DBModel } from "../model/DBModel";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { IRepository } from "../interfaces/IRepository";
import { repository } from "../repository/decorators";
import { Sequence as Seq } from "../model/Sequence";

/**
 * @summary Abstract implementation of a Sequence
 * @description provides the basic functionality for {@link Sequence}s
 *
 * @prop {Repository} repository
 * @prop {SequenceOptions} [options] defaults to {@link DefaultSequenceOptions}
 *
 * @class AbsSequence
 * @abstract
 * @implements Sequence
 *
 * @category Sequences
 */
export abstract class AbsSequence<
  T extends DBModel,
  V extends SequenceOptions = SequenceOptions,
> implements Sequence
{
  @repository(Seq)
  protected sequenceManager!: IRepository<Seq>;

  private readonly defaultOptions: V = {
    startingValue: 0,
  } as V;

  protected readonly options: V;

  protected constructor(
    protected readonly model: Constructor<T>,
    options?: V,
  ) {
    this.options = Object.assign({}, this.defaultOptions, options) as V;
  }

  /**
   * @summary Retrieves the current value for the sequence
   * @protected
   */
  async current(): Promise<string | number> {
    let name;
    try {
      name = this.model.name;
      const sequence: Seq = await this.sequenceManager.read(name);
      return this.parse((sequence.current as string | number).toString());
    } catch (e: any) {
      if (e instanceof NotFoundError) {
        if (typeof this.options.startingValue === "undefined")
          throw new InternalError(
            "Starting value is not defined for a non existing sequence",
          );
        try {
          return this.parse(this.options.startingValue.toString());
        } catch (e: any) {
          throw new InternalError(
            sf(
              "Failed to parse initial value for sequence {0}: {1}",
              this.options.startingValue as string,
              e,
            ),
          );
        }
      }
      throw new InternalError(
        sf(
          "Failed to retrieve current value for sequence {0}: {1}",
          name as string,
          e,
        ),
      );
    }
  }

  /**
   * @summary Parses the {@link Sequence} value
   *
   * @param {string} index the value in string format
   * @protected
   */
  protected parse(index: string): any {
    return index;
  }

  /**
   * @summary Generates the next {@link Sequence} value in string format
   * @description Depending on {@link SequenceOptions#useIndexes},
   * it will concatenate the index based sequence string.
   * The generated string will follow the pattern ```<tableName>_<index>_<value of indexed properties.join('_')>```
   *
   * @param {any} next
   * @param {T} model
   *
   * @private
   */
  private generate(next: any, model: T): string {
    if (model instanceof Seq) (model as Seq).current = next.toString();
    return next.toString();
  }

  /**
   * @summary increments the sequence
   * @description Sequence specific implementation
   *
   * @param {any} current
   * @protected
   */
  protected increment(current: any): Promise<any> {
    return current;
  }

  /**
   * @summary Generates the next value in th sequence
   * @description calls {@link AbsSequence#parse} on the current value
   * followed by {@link AbsSequence#increment}
   *
   * @param {T} model
   */
  async next(): Promise<number | string> {
    const current = await this.current();
    return this.increment(current);
  }
}
