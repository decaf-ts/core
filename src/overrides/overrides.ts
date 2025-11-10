import { Metadata } from "@decaf-ts/decoration";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import {
  Context,
  ContextArgs,
  Contextual,
  DefaultRepositoryFlags,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { PersistenceKeys } from "../persistence/constants";

(Metadata as any).validationExceptions = function <M extends Model>(
  this: Metadata,
  model: Constructor<M>,
  op: OperationKeys
): string[] {
  const noValidation: Record<string, OperationKeys[]> | undefined =
    Metadata.get(model, PersistenceKeys.NO_VALIDATE);
  if (!noValidation) return [];

  return Object.entries(noValidation)
    .filter(([, val]) => val.includes(op))
    .map(([key]) => key);
}.bind(Metadata);

(DefaultRepositoryFlags as any).transaction = undefined;

const transactionContexts = new WeakMap<object, Context<any>>();

(Context as any).childFrom = <F extends RepositoryFlags, C extends Context<F>>(
  context: C,
  overrides?: Partial<F>
): C => {
  const baseCache = Object.assign({}, (context as any).cache, overrides || {});
  const child = Context.factory(
    Object.assign({}, baseCache, {
      parentContext: context,
    })
  ) as unknown as C;
  const existingChildren =
    (context.get("childContexts") as Context<any>[] | undefined) || [];
  context.accumulate({
    childContexts: [...existingChildren, child],
  } as Partial<RepositoryFlags>);
  return child;
};

(Context as any).args = async <
  M extends Model<any>,
  C extends Context<F>,
  F extends RepositoryFlags,
>(
  operation:
    | OperationKeys.CREATE
    | OperationKeys.READ
    | OperationKeys.UPDATE
    | OperationKeys.DELETE,
  model: Constructor<M>,
  args: any[],
  contextual?: Contextual<F>,
  overrides?: Partial<F>
): Promise<ContextArgs<F, C>> => {
  const overridesClone: Partial<F> = Object.assign({}, overrides);
  const transactionKey =
    overridesClone &&
    typeof (overridesClone as Partial<RepositoryFlags>).transaction ===
      "object" &&
    (overridesClone as Partial<RepositoryFlags>).transaction !== null
      ? ((overridesClone as Partial<RepositoryFlags>).transaction as object)
      : undefined;
  const parentContext = transactionKey
    ? (transactionContexts.get(transactionKey) as C | undefined)
    : undefined;
  if (parentContext) {
    overridesClone.parentContext = parentContext;
  }

  const last = args.pop();

  async function getContext() {
    if (contextual)
      return contextual.context(
        operation,
        overridesClone || {},
        model,
        ...args
      );
    return Context.from(operation, overridesClone || {}, model, ...args);
  }

  let c: C;
  if (last instanceof Context) {
    c = last as C;
    args.push(last);
  } else {
    if (typeof last !== "undefined") args.push(last);
    c = (await getContext()) as C;
    args.push(c);
  }

  if (parentContext) {
    const children =
      (parentContext.get("childContexts") as Context<any>[] | undefined) || [];
    parentContext.accumulate({
      childContexts: [...children, c],
    } as Partial<RepositoryFlags>);
  } else if (transactionKey) {
    transactionContexts.set(transactionKey, c);
  }

  return { context: c, args: args };
};
