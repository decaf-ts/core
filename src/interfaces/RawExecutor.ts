/**
 * @summary Executes a raw instruction in the Database
 * @typeDef T The input type
 *
 * @interface RawExecutor
 * @category Query
 */
export interface RawExecutor<T> {
    /**
     * @summary Executes a raw instruction in the Database
     *
     * @typeDef V the expected outcome of the instruction
     * @param rawInput
     * @param args
     *
     * @method
     */
    raw<V>(rawInput: T, ...args: any[]): Promise<V>
}