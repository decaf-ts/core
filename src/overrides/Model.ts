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

    /**
     * @description Generates a sequence name for a model
     * @summary Creates a standardized sequence name by combining the table name with additional arguments
     * @template M - Type that extends Model
     * @param {M | Constructor<M>} model - The model instance or constructor to generate the sequence name for
     * @param {...string} args - Additional string arguments to append to the sequence name
     * @return {string} The generated sequence name
     */
    function sequenceName<M extends Model>(
      model: M | Constructor<M>,
      ...args: string[]
    ): string;
    /**
     * @description Gets the table name for a model
     * @summary Retrieves the table name associated with a model by checking metadata or falling back to the constructor name
     * @template M - Type that extends Model
     * @param {M | Constructor<M>} model - The model instance or constructor to get the table name for
     * @return {string} The table name for the model
     */
    function tableName<M extends Model<boolean>>(
      model: Constructor<M> | M
    ): string;
    function columnName<M extends Model<boolean>>(
      model: Constructor<M> | M,
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
