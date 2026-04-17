import "@decaf-ts/core";
import { Model, model } from "@decaf-ts/decorator-validation";
import { pk, sequence } from "../../src/identity/decorators";

describe("sequence decorator", () => {
  it("exposes seq metadata per property and defaults to pk when undefined", () => {
    @model()
    class SequenceTest extends Model {
      @pk()
      id!: string;

      @sequence()
      orderNumber!: number;
    }

    const pkMetadata = Model.sequenceFor(SequenceTest);
    expect(pkMetadata).toBeDefined();
    expect(pkMetadata.type).toBe(String);

    const sequenceMeta = Model.sequenceFor(SequenceTest, "orderNumber");
    expect(sequenceMeta).toBeDefined();
    expect(sequenceMeta.type).toBe(Number);
    expect(sequenceMeta.generated).toBe(true);
  });

  it("throws if property has no sequence metadata", () => {
    @model()
    class MissingSequence extends Model {
      @pk()
      id!: string;
    }

    expect(() => Model.sequenceFor(MissingSequence, "missing")).toThrow(
      /No sequence options defined for property/
    );
  });
});
