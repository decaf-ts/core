/**
 * @module core
 * @description Core module for the Decaf TypeScript framework
 * @summary This module provides the foundational components of the Decaf framework, including identity management,
 * model definitions, repository patterns, persistence layer, query building, and utility functions.
 * It exports functionality from various submodules and sets up the injectable registry for repository decorators.
 */

import { InjectablesRegistry } from "./repository/injectables";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { Metadata } from "@decaf-ts/decoration";

// overrides the previous Injectables registry to enable the @repository decorator
Injectables.setRegistry(new InjectablesRegistry());

// imported first on purpose
export * from "./overrides";
export * from "./repository";

export * from "./identity";
export * from "./interfaces";
export * from "./model";
export * from "./query";
export * from "./utils";
//left to last on purpose
export * from "./persistence";
export * from "./ram";

/**
 * @description Stores the current package version
 * @summary A constant representing the version of the core package
 * @const VERSION
 * @memberOf module:core
 */
export const VERSION = "##VERSION##";

/**
 * @description Stores the current package version
 * @summary A constant representing the version of the core package
 * @const PACKAGE_NAME
 * @memberOf module:core
 */
export const PACKAGE_NAME = "##PACKAGE##";

Metadata.registerLibrary(PACKAGE_NAME, VERSION);
