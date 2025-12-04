import "@decaf-ts/injectable-decorators";
import { Repository } from "../repository/Repository";
import { Service } from "../utils/Services";
import { Constructor } from "@decaf-ts/decoration";

declare module "@decaf-ts/injectable-decorators" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Injectables {
    function repositories<R extends Repository<any, any>>(
      flavour: string
    ): Record<string, Record<string, Constructor<R>>>;
    function services<S extends Service>(): Record<string, Constructor<S>>;
  }
}
