import { ModelArg, Model } from "@decaf-ts/decorator-validation";
import { createdAt, updatedAt } from "./decorators";

/**
 * @description Base model class for all domain models
 * @summary An abstract base class that extends the Model class from decorator-validation and adds timestamp functionality.
 * All domain models in the application should extend this class to inherit common properties and behaviors.
 * @param {ModelArg<BaseModel>} arg - Optional initialization data for the model
 * @class BaseModel
 * @example
 * ```typescript
 * class User extends BaseModel {
 *   @required()
 *   username!: string;
 *
 *   @email()
 *   email!: string;
 *
 *   constructor(data?: ModelArg<User>) {
 *     super(data);
 *   }
 * }
 *
 * const user = new User({ username: 'john', email: 'john@example.com' });
 * ```
 */
export abstract class BaseModel extends Model {
  /**
   * @description Creation timestamp for the model
   * @summary Automatically set to the current date and time when the model is created
   */
  @createdAt()
  createdAt!: Date;

  /**
   * @description Last update timestamp for the model
   * @summary Automatically updated to the current date and time whenever the model is modified
   */
  @updatedAt()
  updatedAt!: Date;

  protected constructor(arg?: ModelArg<BaseModel>) {
    super(arg);
  }
}
