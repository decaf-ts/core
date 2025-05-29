import { Context } from "@decaf-ts/db-decorators";
import { RamFlags } from "./types";

/**
 * @description Context class for RAM adapter operations
 * @summary Provides a specialized context for RAM adapter operations, extending the base Context
 * with RAM-specific flags. This context is used to pass operation parameters and user information.
 * @class RamContext
 * @example
 * ```typescript
 * // Create a new RAM context with UUID
 * const context = new RamContext({ UUID: '123e4567-e89b-12d3-a456-426614174000' });
 *
 * // Access the UUID from the context
 * const uuid = context.get('UUID');
 * ```
 */
export class RamContext extends Context<RamFlags> {
  constructor() {
    super();
  }
}
