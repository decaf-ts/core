import { type ModelArg } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { FabricBaseModel } from "./FabricBaseModel";
import {
  index,
  OrderDirection,
  createdBy,
  updatedBy,
} from "../../../src/index";
import { RamFlavour } from "../../../src/ram/index";

@uses(RamFlavour)
export class FabricIdentifiedModel extends FabricBaseModel {
  @createdBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  createdBy!: string;
  @updatedBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  updatedBy!: string;

  constructor(arg?: ModelArg<FabricIdentifiedModel>) {
    super(arg);
  }
}
