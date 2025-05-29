import { RamAdapter } from "./RamAdapter";

/**
 * @module ram
 * @description In-memory adapter module for the Decaf TypeScript framework
 * @summary This module provides an in-memory implementation of the persistence layer.
 * It includes a RAM-based adapter, context, statement builder, paginator, and sequence generator
 * for storing and retrieving data in memory. This is useful for testing, prototyping,
 * and applications that don't require persistent storage.
 */

// Invoked there to ensure decoration override
RamAdapter.decoration();

export * from "./model";
export * from "./constants";
export * from "./handlers";
export * from "./RamContext";
export * from "./RamPaginator";
export * from "./RamStatement";
export * from "./RamSequence";
export * from "./types";
// left to last on purpose
export * from "./RamAdapter";
