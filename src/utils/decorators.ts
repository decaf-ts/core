import { apply, metadata, Metadata } from "@decaf-ts/decoration";
import { inject, injectable } from "@decaf-ts/injectable-decorators";
import { PersistenceKeys } from "../persistence/index";

export function service(key: string) {
  return function service(target: any, prop?: any, descriptor?: any) {
    Metadata.set(PersistenceKeys.SERVICE, key, target);
    const decs = [];
    if (descriptor && typeof descriptor.value === "number") {
      decs.push(inject());
    } else if (!descriptor && !prop) {
      decs.push(
        injectable({
          callback: (inst: any) =>
            Object.defineProperty(inst, "name", {
              enumerable: true,
              configurable: false,
              writable: false,
              value: key,
            }),
        })
      );
    } else if (!descriptor) {
      decs.push(inject());
    } else throw new Error("Invalid decorator usage. Should be impossible");

    decs.push(metadata(PersistenceKeys.SERVICE, key));
    return apply(...decs)(target, prop, descriptor);
  };
}
