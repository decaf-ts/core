import {
  Decoration,
  DecorationKeys,
  DefaultFlavour,
  uses,
  Metadata,
} from "@decaf-ts/decoration";
import { model, Model, ModelArg } from "@decaf-ts/decorator-validation";

const f1 = jest.fn();
const f2 = jest.fn();
const f3 = jest.fn();

describe("Multiple Flavours", () => {
  function decorator(arg: string, arg2: number) {
    function innerFlavourDecorator(arg: string, arg2: number) {
      return function innerFlavourDecorator(
        target: object,
        propertyKey?: any,
        descriptor?: any
      ) {
        return f1(arg, arg2, target, propertyKey, descriptor);
      };
    }
    return Decoration.for("X")
      .define({
        decorator: innerFlavourDecorator,
        args: [arg, arg2],
      })
      .apply();
  }

  function innerFlavourDecorator2(arg: string, arg2: number) {
    return function innerFlavourDecorator(
      target: object,
      propertyKey?: any,
      descriptor?: any
    ) {
      return f2(arg, arg2, target, propertyKey, descriptor);
    };
  }

  function innerFlavourDecorator3(arg: string, arg2: number) {
    return function innerFlavourDecorator(
      target: object,
      propertyKey?: any,
      descriptor?: any
    ) {
      return f3(arg, arg2, target, propertyKey, descriptor);
    };
  }

  Decoration.flavouredAs("2")
    .for("X")
    .define({
      decorator: innerFlavourDecorator2,
    } as any)
    .apply();

  Decoration.flavouredAs("3")
    .for("X")
    .define({
      decorator: innerFlavourDecorator3,
    } as any)
    .apply();

  it("recognizes multiple flavours without conflict", () => {
    @model()
    class Obj1 extends Model {
      @decorator("first", 1)
      prop!: string;
      constructor(arg?: ModelArg<Obj1>) {
        super(arg);
      }
    }

    @uses("2")
    @model()
    class Obj2 extends Model {
      @decorator("first", 2)
      prop!: string;
      constructor(arg?: ModelArg<Obj2>) {
        super(arg);
      }
    }

    @uses("3")
    @model()
    class Obj3 extends Model {
      @decorator("first", 3)
      prop!: string;
      constructor(arg?: ModelArg<Obj3>) {
        super(arg);
      }
    }

    const meta1 = Metadata.get(Obj1, DecorationKeys.FLAVOUR);
    const meta2 = Metadata.get(Obj2, DecorationKeys.FLAVOUR);
    const meta3 = Metadata.get(Obj3, DecorationKeys.FLAVOUR);

    expect(meta1).toEqual(DefaultFlavour);
    expect(meta2).toEqual("2");
    expect(meta3).toEqual("3");

    const obj1 = new Obj1({
      prop: "test1",
    });
    const obj2 = new Obj2({
      prop: "test2",
    });
    const obj3 = new Obj3({
      prop: "test3",
    });

    expect(f1).toHaveBeenCalledWith(
      "first",
      1,
      Obj1.prototype,
      "prop",
      undefined
    );
    expect(f2).toHaveBeenCalledWith(
      "first",
      2,
      Obj2.prototype,
      "prop",
      undefined
    );
    expect(f3).toHaveBeenCalledWith(
      "first",
      3,
      Obj3.prototype,
      "prop",
      undefined
    );

    expect(Metadata.flavourOf(Obj1)).toEqual(DefaultFlavour);
    expect(Metadata.flavourOf(Obj2)).toEqual("2");
    expect(Metadata.flavourOf(Obj3)).toEqual("3");

    expect(Metadata.flavouredAs("2")).toEqual([Obj2]);
    expect(Metadata.flavouredAs("3")).toEqual([Obj3]);
  });
});
