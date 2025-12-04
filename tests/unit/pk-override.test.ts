import { uses } from "@decaf-ts/decoration";
import { Model, ModelArg, model } from "@decaf-ts/decorator-validation";
import { Decoration } from "@decaf-ts/decoration";
import { DBKeys, SequenceOptions } from "@decaf-ts/db-decorators";
import { pk } from "../../src/identity";

describe("pk decoration overrides", () => {
  const CustomFlavour = "pk-override-test";
  let captured: SequenceOptions[] = [];

  beforeAll(() => {
    Decoration.flavouredAs(CustomFlavour)
      .for(DBKeys.ID)
      .define({
        decorator: function pkOverride(options: SequenceOptions) {
          return function pkOverrideDecorator(target: any, prop: any) {
            captured.push({ ...(options as Record<string, unknown>) } as any);
            return target && prop ? undefined : undefined;
          };
        },
      } as any)
      .apply();
  });

  beforeEach(() => {
    captured = [];
  });

  it("passes SequenceOptions once when overriding pk via flavour", () => {
    @uses(CustomFlavour)
    @model()
    class CustomModel extends Model {
      @pk({ type: "Number", generated: false })
      id!: number;

      constructor(arg?: ModelArg<CustomModel>) {
        super(arg);
      }
    }
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      type: "Number",
      generated: false,
      startWith: 0,
      incrementBy: 1,
      cycle: false,
    });
    void CustomModel; // silence unused class lint
  });

  it("passes the original options to every class using the override", () => {
    @uses(CustomFlavour)
    @model()
    class FirstModel extends Model {
      @pk({ type: "Number", generated: true })
      id!: number;
    }

    @uses(CustomFlavour)
    @model()
    class SecondModel extends Model {
      @pk({ type: "String", generated: false })
      id!: string;
    }

    expect(captured).toHaveLength(2);
    expect(captured[0]).toMatchObject({
      type: "Number",
      generated: true,
    });
    expect(captured[1]).toMatchObject({
      type: "String",
      generated: false,
    });
    void FirstModel;
    void SecondModel;
  });
});
