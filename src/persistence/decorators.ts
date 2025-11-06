import { PersistenceKeys } from "./constants";
import { Adapter } from "./Adapter";
import { apply, metadata } from "@decaf-ts/decoration";

/**
 * @description Specifies which persistence adapter flavor a model should use
 * @summary This decorator applies metadata to a model class to indicate which persistence adapter flavor
 * should be used when performing database operations on instances of the model. The flavor is a string
 * identifier that corresponds to a registered adapter configuration.
 * @param {string} flavour - The identifier of the adapter flavor to use
 * @return {Function} A decorator function that can be applied to a model class
 * @function uses
 * @category Class Decorators
 */
export function uses(flavour: string) {
  return function uses(original: any) {
    return apply(metadata(Adapter.key(PersistenceKeys.ADAPTER), flavour))(
      original
    );
  };
}
