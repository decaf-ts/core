import { Constructor } from "@decaf-ts/decoration";
import { OperationKeys } from "@decaf-ts/db-decorators";
import "@decaf-ts/decorator-validation";
import { ModelErrorDefinition } from "@decaf-ts/decorator-validation";
import { SequenceOptions } from "../interfaces/index";

declare module "@decaf-ts/decorator-validation" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Model {
    /**
     * @description Gets sequence options for a model's primary key.
     * @summary Retrieves the sequence configuration for a model's primary key from metadata.
     * @template M - The model type that extends Model.
     * @param {M} model - The model instance.
     * @return {SequenceOptions} The sequence options for the model's primary key.
     * @throws {InternalError} If no sequence options are defined for the model.
     */
    function pkProps<M extends Model<boolean>>(
      model: Constructor<M>
    ): SequenceOptions;

    function tableName<M extends Model<boolean>>(m: Constructor<M> | M): string;
    function columnName<M extends Model<boolean>>(
      m: Constructor<M> | M,
      prop: keyof M
    ): string;
    function nonValidatableFor<M extends Model<boolean>>(
      m: Constructor<M> | M,
      op: OperationKeys.CREATE | OperationKeys.UPDATE | string
    ): string[];
    function validateOn<M extends Model<boolean>>(
      m: Constructor<M> | M,
      op: OperationKeys.CREATE | OperationKeys
    ): M extends Model<true>
      ? Promise<ModelErrorDefinition | undefined>
      : ModelErrorDefinition | undefined;
  }

  export interface Model {
    hasErrorsOn<M extends Model<boolean>>(
      op: OperationKeys.CREATE | OperationKeys.UPDATE | string
    ): M extends Model<true>
      ? Promise<ModelErrorDefinition | undefined>
      : ModelErrorDefinition | undefined;
  }
}
