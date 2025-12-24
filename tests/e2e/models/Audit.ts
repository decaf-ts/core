import { E2eConfig } from "../e2e.config";
import {
  model,
  type ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import {
  BlockOperations,
  OperationKeys,
  readonly,
  serialize,
} from "@decaf-ts/db-decorators";
import { description, uses } from "@decaf-ts/decoration";
import { BaseModel } from "./BaseModel";
import { AuditOperations, TableNames } from "./constants";
import {
  column,
  createdBy,
  index,
  OrderDirection,
  pk,
  table,
} from "../../../src/index";

@description("Logs user activity for auditing purposes.")
@BlockOperations([
  // OperationKeys.CREATE,
  OperationKeys.UPDATE,
  OperationKeys.DELETE,
])
@uses(E2eConfig.flavour)
@table(TableNames.Audit)
@model()
export class Audit extends BaseModel {
  @pk({ type: "uuid" })
  @description("Unique identifier of the audit record.")
  id!: string;

  @column()
  @createdBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Identifier of the user who performed the action.")
  userId!: string;

  @column()
  @required()
  @readonly()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Group or role of the user who performed the action.")
  userGroup!: string;

  @column()
  @required()
  @readonly()
  @description("the transaction the audit record was created in")
  transaction!: string;

  @column()
  @required()
  @readonly()
  @type(String)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Type of action performed by the user.")
  action!: AuditOperations;

  @column()
  @readonly()
  @serialize()
  @description("the diffs for the action.")
  diffs?: Record<string, any>;

  constructor(model?: ModelArg<Audit>) {
    super(model);
  }
}
