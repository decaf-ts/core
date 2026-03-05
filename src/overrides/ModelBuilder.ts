import "@decaf-ts/decorator-validation";

declare module "@decaf-ts/decorator-validation" {
  export interface ModelBuilder<M> {
    table(tableName: string): ModelBuilder<M>;
    unique(attr: keyof M): ModelBuilder<M>;
    createdBy(attr: keyof M): ModelBuilder<M>;
    updatedBy(attr: keyof M): ModelBuilder<M>;
    createdAt(attr: keyof M): ModelBuilder<M>;
    updatedAt(attr: keyof M): ModelBuilder<M>;
    oneToOne<N extends keyof M>(
      attr: N,
      clazz: any | (() => any),
      cascade?: any,
      populate?: boolean,
      joinColumnOpts?: any,
      fk?: string
    ): ModelBuilder<M>;
    oneToMany<N extends keyof M>(
      attr: N,
      clazz: any | (() => any),
      cascade?: any,
      populate?: boolean,
      joinTableOpts?: any,
      fk?: string
    ): ModelBuilder<M>;
    manyToOne<N extends keyof M>(
      attr: N,
      clazz: any | (() => any),
      cascade?: any,
      populate?: boolean,
      joinTableOpts?: any,
      fk?: string
    ): ModelBuilder<M>;
    manyToMany<N extends keyof M>(
      attr: N,
      clazz: any | (() => any),
      cascade?: any,
      populate?: boolean,
      joinTableOpts?: any,
      fk?: string
    ): ModelBuilder<M>;
    noValidateOn(attr: keyof M, ...ops: any[]): ModelBuilder<M>;
    noValidateOnCreate(attr: keyof M): ModelBuilder<M>;
    noValidateOnUpdate(attr: keyof M): ModelBuilder<M>;
    noValidateOnCreateUpdate(attr: keyof M): ModelBuilder<M>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface AttributeBuilder<M, N extends keyof M, T> {
    column<N2 extends keyof M>(columnName?: string): AttributeBuilder<M, N2, T>;
    unique<N2 extends keyof M>(): AttributeBuilder<M, N2, T>;
    createdBy<N2 extends keyof M>(): AttributeBuilder<M, N2, T>;
    updatedBy<N2 extends keyof M>(): AttributeBuilder<M, N2, T>;
    createdAt<N2 extends keyof M>(): AttributeBuilder<M, N2, T>;
    updatedAt<N2 extends keyof M>(): AttributeBuilder<M, N2, T>;
    noValidateOn<N2 extends keyof M>(...ops: any[]): AttributeBuilder<M, N2, T>;
    noValidateOnCreate<N2 extends keyof M>(): AttributeBuilder<M, N2, T>;
    noValidateOnUpdate<N2 extends keyof M>(): AttributeBuilder<M, N2, T>;
    noValidateOnCreateUpdate<N2 extends keyof M>(): AttributeBuilder<M, N2, T>;
  }
}
