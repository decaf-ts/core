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
