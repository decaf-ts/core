/**
 * @description Exports for the ram module.
 * @summary This file exports all the necessary components for the ram functionality, including the RamAdapter, constants, handlers, and more.
 * @module core/ram
 */
import { RamAdapter } from "./RamAdapter";

// Invoked there to ensure decoration override
RamAdapter.decoration();

export * from "./constants";
export * from "./handlers";
export * from "./RamPaginator";
export * from "./RamStatement";
export * from "./types";
// left to last on purpose
export * from "./RamAdapter";
