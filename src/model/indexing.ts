import { IndexMetadata } from "../repository/types";
import { OrderDirection } from "../repository/constants";
import { PersistenceKeys } from "../persistence/constants";
import { Decoration, propMetadata } from "@decaf-ts/decoration";
import { Metadata } from "@decaf-ts/decoration";
/**
 * @description Creates an index on a model property for improved query performance
 * @summary Decorator that marks a property to be indexed in the database, optionally with specific directions and compositions
 * @param {OrderDirection[]} [directions] - Optional array of sort directions for the index
 * @param {string[]} [compositions] - Optional array of property names to create a composite index
 * @return {Function} A decorator function that can be applied to a class property
 * @function index
 * @category Property Decorators
 */
export function index(): ReturnType<typeof propMetadata>;
export function index(name: string): ReturnType<typeof propMetadata>;
export function index(
  directions: OrderDirection[]
): ReturnType<typeof propMetadata>;
export function index(
  directions: OrderDirection[],
  name: string
): ReturnType<typeof propMetadata>;
export function index(
  directions: OrderDirection[],
  compositions: string[]
): ReturnType<typeof propMetadata>;
export function index(
  directions: readonly OrderDirection[],
  compositions: readonly string[]
): ReturnType<typeof propMetadata>;
export function index(
  directions: readonly OrderDirection[],
  compositions: readonly string[],
  name: string
): ReturnType<typeof propMetadata>;
export function index(compositions: string[]): ReturnType<typeof propMetadata>;
export function index(
  compositions: string[],
  name: string
): ReturnType<typeof propMetadata>;
export function index(
  directions?: readonly OrderDirection[] | readonly string[] | string,
  compositions?: readonly string[] | string,
  name?: string
) {
  function index(
    directions?: OrderDirection[] | string[] | string,
    compositions?: string[] | string,
    name?: string
  ) {
    return function index(obj: any, attr: any) {
      if (typeof directions === "string") {
        name = directions;
        directions = undefined;
        compositions = undefined;
      }
      if (typeof compositions === "string") {
        name = compositions;
        compositions = undefined;
      }
      if (!compositions && directions) {
        if (
          directions.find(
            (d) => ![OrderDirection.ASC, OrderDirection.DSC].includes(d as any)
          )
        ) {
          compositions = directions as string[];
          directions = undefined;
        }
      }

      return propMetadata(
        Metadata.key(
          `${PersistenceKeys.INDEX}${compositions && compositions?.length ? `.${compositions.join(".")}` : ""}`,
          attr
        ),
        {
          directions: directions,
          compositions: compositions,
          name: name,
        } as IndexMetadata
      )(obj, attr);
    };
  }

  return Decoration.for(PersistenceKeys.INDEX)
    .define({
      decorator: index,
      args: [directions, compositions, name],
    })
    .apply();
}
