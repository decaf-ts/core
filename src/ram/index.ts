import { RamAdapter } from "./RamAdapter";

// Invoked there to ensure decoration override
RamAdapter.decoration();

export * from "./model";
export * from "./constants";
export * from "./handlers";
export * from "./RamPaginator";
export * from "./RamStatement";
export * from "./RamSequence";
export * from "./types";
// left to last on purpose
export * from "./RamAdapter";
