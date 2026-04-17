import { Model, type ModelArg } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import {
  index,
  OrderDirection,
  createdAt,
  updatedAt,
  persistentVersion,
} from "../../../src/index";
import { RamFlavour } from "../../../src/ram/index";

@uses(RamFlavour)
export class FabricBaseModel extends Model {
  @createdAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  createdAt!: Date;
  @updatedAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  updatedAt!: Date;
  @persistentVersion()
  version!: number;

  constructor(arg?: ModelArg<FabricBaseModel>) {
    super(arg);
  }
}
