import { Context } from "@decaf-ts/db-decorators";
import { RamFlags } from "./types";

/**
 * @description Context class for RAM adapter operations
 * @summary Provides a specialized context for RAM adapter operations, extending the base Context with RAM-specific flags. This context is used to pass operation parameters and user information.
 * @class RamContext
 * @category Ram
 * @example
 * ```typescript
 * // Create a new RAM context
 * const context = new RamContext();
 * // Optionally set a flag
 * context.set('UUID', '123e4567-e89b-12d3-a456-426614174000');
 * // Access a flag from the context
 * const uuid = context.get('UUID');
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant RamContext
 *   participant BaseContext as Context
 *   Caller->>RamContext: new RamContext()
 *   RamContext->>BaseContext: super()
 *   RamContext-->>Caller: instance
 */
export class RamContext extends Context<RamFlags> {
  constructor() {
    super();
  }
}
