import { description, uses } from "@decaf-ts/decoration";

import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { E2eConfig } from "../e2e.config";
import { TableNames } from "./constants";
import { BaseIdentifiedModel } from "./BaseIdentifiedModel";
import { gtin } from "./gtin";
import { column, pk, table } from "../../../src";

@description("Links a product to a specific market.")
@uses(E2eConfig.flavour)
@table(TableNames.ProductImage)
@model()
export class ProductImage extends BaseIdentifiedModel {
  @pk()
  @gtin()
  @description("Unique identifier composed of product code and market ID.")
  productCode!: string;

  @column()
  @required()
  @description("image content in base64")
  content!: string;

  constructor(model?: ModelArg<ProductImage>) {
    super(model);
  }
}
