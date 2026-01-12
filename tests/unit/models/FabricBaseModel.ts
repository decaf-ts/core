import { Model, type ModelArg } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { version } from "@decaf-ts/db-decorators";
import {
  index,
  OrderDirection,
  createdAt,
  updatedAt,
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
  @version()
  version!: number;

  constructor(arg?: ModelArg<FabricBaseModel>) {
    super(arg);
  }
}
