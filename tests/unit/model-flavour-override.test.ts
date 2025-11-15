import {
  Decoration,
  DecorationKeys,
  DefaultFlavour,
  Metadata,
  uses,
} from "@decaf-ts/decoration";
import { TestModel } from "./TestModel";
import {
  generateInjectableNameForRepository,
  Repository,
} from "../../src/index";

describe("Multiple Decoration Compatibility", () => {
  it("Allows overriding decorations with different flavours", () => {
    const f1 = jest.fn();
    const f2 = jest.fn();
    const f3 = jest.fn();

    function decorator(name: string, num: number) {
      function innerDecorator(name: string, num: number) {
        return function (
          target: any,
          propertyKey?: string | symbol,
          descriptor?: PropertyDescriptor
        ) {
          return f1(name, num, target, propertyKey, descriptor);
        };
      }

      return Decoration.for("TEST")
        .define({
          decorator: innerDecorator,
          args: [name, num],
        })
        .apply();
    }

    function decorator2(name: string, num: number) {
      return function (
        target: any,
        propertyKey?: string | symbol,
        descriptor?: PropertyDescriptor
      ) {
        return f2(name, num, target, propertyKey, descriptor);
      };
    }

    function decorator3(name: string, num: number) {
      return function (
        target: any,
        propertyKey?: string | symbol,
        descriptor?: PropertyDescriptor
      ) {
        return f3(name, num, target, propertyKey, descriptor);
      };
    }

    Decoration.flavouredAs("2")
      .for("TEST")
      .define({
        decorator: decorator2,
      } as any)
      .apply();

    Decoration.flavouredAs("3")
      .for("TEST")
      .define({
        decorator: decorator3,
      } as any)
      .apply();

    class Override1 {
      @decorator("first", 1)
      prop!: string;
      constructor() {}
    }

    @uses("2")
    class Override2 {
      @decorator("first", 2)
      prop!: string;
      constructor() {}
    }

    expect(Metadata.flavourOf(Override1)).toEqual(DefaultFlavour);
    expect(Metadata.flavourOf(Override2)).toEqual("2");

    uses("3")(Override1);
    uses("3")(Override2);

    expect(Metadata.flavourOf(Override1)).toEqual("3");
    expect(Metadata.flavourOf(Override2)).toEqual("3");

    uses("3")(Override2);
    expect(Metadata.flavourOf(Override2)).toEqual("3");
  });

});
