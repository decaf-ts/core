import {
  JSONSerializer,
  Model,
  ModelKeys,
} from "@decaf-ts/decorator-validation";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { Condition } from "../../query/Condition";

export class TaskIOSerializer<M extends Model> extends JSONSerializer<M> {
  constructor() {
    super();
  }

  /**
   * @summary prepares the model for serialization
   * @description returns a shallow copy of the object, containing an enumerable {@link ModelKeys#ANCHOR} property
   * so the object can be recognized upon deserialization
   *
   * @param {T} model
   * @protected
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected override preSerialize(model: M, ...args: any[]) {
    if (model === null || typeof model !== "object") {
      return model;
    }
    const toSerialize: Record<string, any> = Object.assign({}, model);
    if (model instanceof Condition) {
      toSerialize[ModelKeys.ANCHOR] = "??condition";
      return toSerialize;
    }
    if (Model.isModel(model)) {
      let metadata;
      try {
        metadata = Metadata.modelName(model.constructor as Constructor);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error: unknown) {
        metadata = undefined;
      }
      if (metadata) toSerialize[ModelKeys.ANCHOR] = metadata;
    }
    return toSerialize;
  }

  /**
   * @summary Rebuilds a model from a serialization
   * @param {string} str
   *
   * @throws {Error} If it fails to parse the string, or to build the model
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override deserialize(str: string, ...args: any[]): M {
    const deserialization = JSON.parse(str);
    const className = deserialization[ModelKeys.ANCHOR];
    if (!className) return deserialization as M;
    if (className === "??condition")
      return Condition.from(deserialization) as unknown as M;
    return Model.build(deserialization, className) as unknown as M;
  }

  /**
   * @summary Serializes a model
   * @param {T} model
   *
   * @throws {Error} if fails to serialize
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override serialize(model: M, ...args: any[]): string {
    return JSON.stringify(this.preSerialize(model));
  }
}
