import { InjectablesRegistry } from "./repository";
import { Injectables } from "@decaf-ts/injectable-decorators";

export * from "./identity";
export * from "./interfaces";
export * from "./model";
export * from "./persistence";
export * from "./query";
export * from "./repository";

Injectables.setRegistry(new InjectablesRegistry());

/**
 * @summary stores the current package version
 * @description this is how you should document a constant
 * @const VERSION
 * @memberOf module:core
 */
export const VERSION = "##VERSION##";
