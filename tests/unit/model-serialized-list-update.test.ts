import "../../src/overrides";
import { Adapter, BaseModel, column, pk, Repository, table } from "../../src";
import { RamFlavour } from "../../src/ram/index";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { uses, Constructor, Metadata } from "@decaf-ts/decoration";
import {
  JSONSerializer,
  list,
  model,
  Model,
  ModelArg,
  ModelKeys,
  required,
} from "@decaf-ts/decorator-validation";
import { serialize } from "@decaf-ts/db-decorators";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

const adapter = new RamAdapter();

class ArraySerializer<M extends Model> extends JSONSerializer<M> {
  protected override preSerialize(value: any, ...args: any[]) {
    return this.serializeValue(value, ...args);
  }

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override serialize(model: M, ...args: any[]): string {
    return JSON.stringify(this.preSerialize(model));
  }
}

@model()
class ManufacturerAddress extends Model {
  @required()
  address!: string;

  constructor(arg?: ModelArg<ManufacturerAddress>) {
    super(arg);
  }
}

@uses(RamFlavour)
@table("SerializedBatchLike")
@model()
class SerializedBatchLike extends BaseModel {
  @pk()
  id!: string;

  @column()
  @required()
  batchNumber!: string;

  @column()
  @serialize(ArraySerializer)
  @list(ManufacturerAddress)
  manufacturerAddress?: ManufacturerAddress[];

  constructor(arg?: ModelArg<SerializedBatchLike>) {
    super(arg);
  }
}

describe("serialized list update", () => {
  const repo = new Repository(adapter, SerializedBatchLike);

  it("creates without the list and updates with a serialized list", async () => {
    const created = await repo.create(
      new SerializedBatchLike({
        id: "batch-1",
        batchNumber: "B-1",
      })
    );

    expect(created.manufacturerAddress).toBeUndefined();

    const toUpdate = new SerializedBatchLike({
      ...created,
      manufacturerAddress: [
        {
          address: "address1",
        },
      ],
    });

    const updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.manufacturerAddress).toBeDefined();
    expect(updated.manufacturerAddress).toHaveLength(1);
    expect(updated.manufacturerAddress?.[0]).toBeInstanceOf(
      ManufacturerAddress
    );
    expect(updated.manufacturerAddress?.[0].address).toBe("address1");
  });
});
