import { Model } from "@decaf-ts/decorator-validation";
import "../../../src/overrides";
import { metadata, apply } from "@decaf-ts/decoration";
import {
  afterCreate,
  afterDelete,
  afterUpdate,
  ContextOfRepository,
  IRepository,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Audit } from "./Audit";
import { Repository } from "../../../src/repository/Repository";

export async function createAuditHandler<
  M extends Model,
  R extends Repository<M, any>,
  V,
>(
  this: R,
  context: ContextOfRepository<R>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const repo = Repository.forModel(Audit);
  const identity = context.get("UUID");
  const audit = await repo.create(
    new Audit({
      userGroup: identity,
      userId: identity,
      action: OperationKeys.CREATE,
      transaction: identity,
      diffs: new this.class().compare(model),
    })
  );
  context.logger.info(
    `Audit log for ${OperationKeys.CREATE} of ${Model.tableName(this.class)} created: ${audit.id}`
  );
}

export async function updateAuditHandler<
  M extends Model,
  R extends IRepository<M, any>,
  V,
>(
  this: R,
  context: ContextOfRepository<R>,
  data: V,
  key: keyof M,
  model: M,
  oldModel: M
): Promise<void> {
  const repo = Repository.forModel(Audit);
  const identity = context.get("UUID");
  const audit = await repo.create(
    new Audit({
      userGroup: identity,
      userId: identity,
      action: OperationKeys.UPDATE,
      transaction: identity,
      diffs: model.compare(oldModel),
    })
  );
  context.logger.info(
    `Audit log for ${OperationKeys.UPDATE} of ${Model.tableName(this.class)} created: ${audit.id}`
  );
}

export async function deleteAuditHandler<
  M extends Model,
  R extends IRepository<M, any>,
  V,
>(
  this: R,
  context: ContextOfRepository<R>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const repo = Repository.forModel(Audit);
  const identity = context.get("UUID");
  const audit = await repo.create(
    new Audit({
      userGroup: identity,
      userId: identity,
      action: OperationKeys.DELETE,
      transaction: identity,
      diffs: model.compare(new this.class()),
    })
  );
  context.logger.info(
    `Audit log for ${OperationKeys.DELETE} of ${Model.tableName(this.class)} created: ${audit.id}`
  );
}

export function audit() {
  return apply(
    afterCreate(createAuditHandler as any, {}),
    afterUpdate(updateAuditHandler as any, {}),
    afterDelete(deleteAuditHandler as any, {}),
    metadata("audit", true)
  );
}
