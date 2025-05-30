/**
 * @module core
 * @description Core module for the Decaf TypeScript framework
 * @summary This module provides the foundational components of the Decaf framework, including identity management, 
 * model definitions, repository patterns, persistence layer, query building, and utility functions.
 * It exports functionality from various submodules and sets up the injectable registry for repository decorators.
 */

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
 * @description Stores the current package version
 * @summary A constant representing the version of the core package
 * @const VERSION
 * @memberOf module:core
 */
export const VERSION = "##VERSION##";
