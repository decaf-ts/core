import { model, required } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { BaseModel, index, table } from "../../model";
import { pk } from "../../identity";

/**
 * @description RAM sequence model for auto-incrementing values
 * @summary A model class that represents a sequence in the RAM adapter. It stores the current value
 * of a sequence that can be used for generating sequential identifiers for entities.
 * The sequence is identified by its ID and maintains the current value.
 * @param {ModelArg<Sequence>} seq - Initial sequence data
 * @class Sequence
 * @example
 * ```typescript
 * // Create a new sequence
 * const orderSequence = new Sequence({ id: 'order_seq', current: 1 });
 * 
 * // Use the sequence to get the next value
 * const nextOrderId = parseInt(orderSequence.current.toString()) + 1;
 * orderSequence.current = nextOrderId;
 * ```
 */
@table("__RamSequence")
@model()
export class Sequence extends BaseModel {
  /**
   * @description Primary key identifier for the sequence
   */
  @pk()
  id!: string;

  /**
   * @description Current value of the sequence
   * Used to generate the next sequential value
   */
  @required()
  @index()
  current!: string | number;

  constructor(seq?: ModelArg<Sequence>) {
    super(seq);
  }
}
