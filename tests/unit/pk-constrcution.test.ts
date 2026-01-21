import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { pk } from "../../src/index";

@model()
class Something extends Model {
  @pk()
  product!: string;

  @required()
  other!: string;

  constructor(arg?: ModelArg<Something>) {
    super(arg);
  }
}

describe("pk i n construction", () => {
  it("properly adds pk", () => {
    const s = new Something({
      product: "234234",
      other: "asdffdsfgsdg",
    });

    expect(s.product).toEqual("234234");
  });
});
