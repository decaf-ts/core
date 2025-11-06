import "@decaf-ts/decoration";
import type { OperationKeys } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";

declare module "@decaf-ts/decoration" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Metadata {
    function validationExceptions<M extends Model>(
      model: Constructor<M>,
      op: OperationKeys
    ): string[];
  }
}
