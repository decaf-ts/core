import {
  Model,
  type ModelArg,
  model,
  required,
} from "@decaf-ts/decorator-validation";
import { BaseModel, Cascade, oneToOne, pk } from "../../src";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import { Repository } from "../../src/repository";

@model()
class NestedInnerModel extends BaseModel {
  @pk()
  id!: string;

  @required()
  value!: string;

  constructor(arg?: ModelArg<NestedInnerModel>) {
    super(arg);
  }
}

@model()
class InnerModel extends BaseModel {
  @pk()
  id!: string;

  @required()
  name!: string;

  @oneToOne(NestedInnerModel, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  nested?: NestedInnerModel;

  constructor(arg?: ModelArg<InnerModel>) {
    super(arg);
  }
}

@model()
class OuterModel extends BaseModel {
  @pk()
  id!: string;

  @required()
  name!: string;

  @oneToOne(InnerModel, {
    update: Cascade.CASCADE,
    delete: Cascade.CASCADE,
  })
  inner?: InnerModel;

  constructor(arg?: ModelArg<OuterModel>) {
    super(arg);
  }
}

const buildNested = (value = "nested") =>
  new NestedInnerModel({
    id: "nested-1",
    value,
  });

const buildInner = ({
  id = "inner-1",
  name = "inner",
  nested,
}: {
  id?: string;
  name?: string;
  nested?: NestedInnerModel;
} = {}) =>
  new InnerModel({
    id,
    name,
    nested,
  } as any);

const buildOuter = ({
  id = "outer-1",
  name = "outer",
  inner,
}: {
  id?: string;
  name?: string;
  inner?: InnerModel;
} = {}) =>
  new OuterModel({
    id,
    name,
    inner,
  } as any);

describe("Model.merge", () => {
  it("keeps scalar values when the new model leaves them undefined or omitted", () => {
    const oldModel = buildOuter();

    const undefinedValue = Model.merge(
      oldModel,
      new OuterModel({
        id: oldModel.id,
        name: undefined,
      } as any),
      OuterModel
    );

    const omittedValue = Model.merge(
      oldModel,
      new OuterModel({
        id: oldModel.id,
      } as any),
      OuterModel
    );

    expect(undefinedValue).toBeInstanceOf(OuterModel);
    expect(undefinedValue.inner).toBeUndefined();
    expect(undefinedValue.name).toBe(oldModel.name);
    expect(omittedValue).toBeInstanceOf(OuterModel);
    expect(omittedValue.inner).toBeUndefined();
    expect(omittedValue.name).toBe(oldModel.name);
  });

  it("overrides scalar values when the new model provides them", () => {
    const oldModel = buildOuter();

    const merged = Model.merge(
      oldModel,
      new OuterModel({
        id: oldModel.id,
        name: "outer-updated",
      } as any),
      OuterModel
    );

    expect(merged).toBeInstanceOf(OuterModel);
    expect(merged.name).toBe("outer-updated");
  });

  it("infers the constructor when the third argument is omitted", () => {
    const oldModel = buildOuter();
    Object.defineProperty(oldModel, "constructor", {
      value: OuterModel,
    });

    const merged = Model.merge(
      oldModel,
      buildOuter({
        id: oldModel.id,
        name: "outer-updated",
      })
    );

    expect(merged).toBeInstanceOf(OuterModel);
    expect(merged.name).toBe("outer-updated");
  });

  it("preserves the top-level relation when the new relation is undefined", () => {
    const oldModel = buildOuter({
      inner: buildInner({
        nested: buildNested(),
      }),
    });

    const merged = Model.merge(
      oldModel,
      buildOuter({
        id: oldModel.id,
        name: oldModel.name,
        inner: undefined,
      } as any),
      OuterModel
    );

    expect(merged.inner).toBeUndefined();
  });

  it("replaces the whole relation object when the new relation is defined", () => {
    const oldModel = buildOuter({
      inner: buildInner({
        nested: buildNested(),
      }),
    });

    const merged = Model.merge(
      oldModel,
      buildOuter({
        id: oldModel.id,
        name: oldModel.name,
        inner: buildInner({
          name: "inner-updated",
        }),
      }),
      OuterModel
    );

    expect(merged.inner).toBeInstanceOf(InnerModel);
    expect(merged.inner).not.toBe(oldModel.inner);
    expect(merged.inner?.name).toBe("inner-updated");
    expect(merged.inner?.nested).toBeUndefined();
  });

  it("clears the top-level relation when the updated model materializes it as undefined", () => {
    const oldModel = buildOuter({
      inner: buildInner({
        nested: buildNested(),
      }),
    });

    const merged = Model.merge(
      oldModel,
      buildOuter({
        id: oldModel.id,
        name: "outer-updated",
      }),
      OuterModel
    );

    expect(merged.name).toBe("outer-updated");
    expect(merged.inner).toBeUndefined();
  });
});

describe("one-to-one nested undefined updates", () => {
  let adapter: RamAdapter;
  let outerRepository: RamRepository<OuterModel>;

  beforeAll(() => {
    adapter = new RamAdapter();
    outerRepository = new Repository(adapter, OuterModel);
  });

  it("clears the nested one-to-one relation after updating it to undefined", async () => {
    const created = await outerRepository.create(
      new OuterModel({
        id: "outer-1",
        name: "outer",
        inner: {
          id: "inner-1",
          name: "inner",
          nested: {
            id: "nested-1",
            value: "nested",
          },
        },
      })
    );

    expect(created.inner).toBeDefined();
    expect(created.inner).toBeInstanceOf(InnerModel);
    expect(created.inner?.nested).toBeDefined();
    expect(created.inner?.nested).toBeInstanceOf(NestedInnerModel);

    const updateModel = new OuterModel({
      id: created.id,
      name: created.name,
      inner: new InnerModel({
        id: created.inner?.id,
        name: created.inner?.name ?? "inner",
        nested: undefined,
      }),
    });

    const newModel = Model.merge(created, updateModel, OuterModel);

    const updated = await outerRepository.update(newModel);

    expect(updated.inner).toBeDefined();
    expect(updated.inner).toBeInstanceOf(InnerModel);
    expect(updated.inner?.nested).toBeUndefined();

    const read = await outerRepository.read(created.id);

    expect(read.inner).toBeDefined();
    expect(read.inner).toBeInstanceOf(InnerModel);
    expect(read.inner?.nested).toBeUndefined();
  });
});
