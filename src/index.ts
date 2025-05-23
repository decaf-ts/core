import { InjectablesRegistry } from "./repository";
import { Injectables } from "@decaf-ts/injectable-decorators";

// overrides the previous Injectables registry to enable the @repository decorator
Injectables.setRegistry(new InjectablesRegistry());

export * from "./identity";
export * from "./interfaces";
export * from "./model";
export * from "./query";
export * from "./repository";
export * from "./utils";
//left to last on purpose
export * from "./persistence";

/**
 * @summary stores the current package version
 * @description this is how you should document a constant
 * @const VERSION
 * @memberOf module:core
 */
export const VERSION = "##VERSION##";
