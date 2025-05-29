/**
 * @description Creates a decorator that makes a method non-configurable
 * @summary This decorator prevents a method from being overridden by making it non-configurable.
 * It throws an error if used on anything other than a method.
 * @return {Function} A decorator function that can be applied to methods
 * @function final
 * @category Method Decorators
 */
export function final() {
  return (
    target: object,
    propertyKey?: any,
    descriptor?: PropertyDescriptor
  ) => {
    if (!descriptor)
      throw new Error("final decorator can only be used on methods");
    if (descriptor?.configurable) {
      descriptor.configurable = false;
    }
    return descriptor;
  };
}
