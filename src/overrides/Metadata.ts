import "@decaf-ts/decoration";
import type { Constructor, Model } from "@decaf-ts/decorator-validation";
import type { OperationKeys } from "@decaf-ts/db-decorators";

declare module "@decaf-ts/decoration" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Metadata {
    function validationExceptions<M extends Model>(
      model: Constructor<M>,
      op: OperationKeys
    ): string[];
  }
}
