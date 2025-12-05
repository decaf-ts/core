import { apply, metadata, Metadata } from "@decaf-ts/decoration";
import { inject, injectable } from "@decaf-ts/injectable-decorators";
import { PersistenceKeys } from "../persistence/index";
import { ModelConstructor } from "@decaf-ts/decorator-validation";

export function service(key: string | ModelConstructor<any>) {
  key =
    typeof key === "string"
      ? key
      : Metadata.Symbol(key as ModelConstructor<any>).toString();
  return function service(target: any, prop?: any, descriptor?: any) {
    Metadata.set(PersistenceKeys.SERVICE, key, target);
    const decs = [];
    if (descriptor && typeof descriptor.value === "number") {
      decs.push(inject(key));
    } else if (!descriptor && !prop) {
      decs.push(
        injectable(key, {
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
      decs.push(inject(key));
    } else throw new Error("Invalid decorator usage. Should be impossible");

    decs.push(metadata(PersistenceKeys.SERVICE, key));
    return apply(...decs)(target, prop, descriptor);
  };
}
