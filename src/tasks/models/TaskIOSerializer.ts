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
   * @param {any} value
   * @protected
   */
  protected override preSerialize(value: any, ...args: any[]) {
    return this.serializeValue(value, ...args);
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
    return this.rebuildValue(deserialization) as M;
  }

  private serializeValue(value: any, ...args: any[]): any {
    if (value === undefined || value === null) return value;
    if (typeof value !== "object") return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((item) => this.serializeValue(item, ...args));
    }
    if (value instanceof Condition) {
      const condition = this.serializePlain(
        value as Record<string, any>,
        ...args
      );
      condition[ModelKeys.ANCHOR] = "??condition";
      return condition;
    }
    if (Model.isModel(value)) {
      return this.serializeModel(value, ...args);
    }
    return this.serializePlain(value, ...args);
  }

  private serializeModel(value: Model, ...args: any[]): Record<string, any> {
    const serialized = this.serializePlain(
      value as Record<string, any>,
      ...args
    );
    const metadata =
      this.getMetadata(value.constructor as Constructor) ??
      value.constructor?.name;
    if (metadata) serialized[ModelKeys.ANCHOR] = metadata;
    return serialized;
  }

  private serializePlain(
    value: Record<string, any>,
    ...args: any[]
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = this.serializeValue(child, ...args);
    }
    return result;
  }

  private getMetadata(constructor: Constructor): string | undefined {
    try {
      return Metadata.modelName(constructor);
    } catch {
      return undefined;
    }
  }

  private rebuildValue(value: any): any {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.rebuildValue(item));
    }
    const anchor = value[ModelKeys.ANCHOR];
    const rebuilt = this.rebuildObject(value);
    if (!anchor) return rebuilt;
    if (anchor === "??condition") return Condition.from(rebuilt);
    return Model.build(rebuilt, anchor);
  }

  private rebuildObject(value: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === ModelKeys.ANCHOR) continue;
      result[key] = this.rebuildValue(child);
    }
    return result;
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
