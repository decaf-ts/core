![Banner](./workdocs/assets/decaf-logo.svg)

# Decaf TS — Core Package

Decaf Core provides the foundational building blocks for the Decaf TypeScript ecosystem: strongly-typed models, repository pattern, pluggable persistence adapters, a composable query DSL, and pagination/observer utilities. With decorators and an injectable registry, it wires models to repositories and adapters so you can build data access that is framework-agnostic yet fully typed.

> Release docs refreshed on 2025-11-26. See [workdocs/reports/RELEASE_NOTES.md](./workdocs/reports/RELEASE_NOTES.md) for ticket summaries.

![Licence](https://img.shields.io/github/license/decaf-ts/core.svg?style=plastic)
![GitHub language count](https://img.shields.io/github/languages/count/decaf-ts/core?style=plastic)
![GitHub top language](https://img.shields.io/github/languages/top/decaf-ts/core?style=plastic)

[![Build & Test](https://github.com/decaf-ts/core/actions/workflows/nodejs-build-prod.yaml/badge.svg)](https://github.com/decaf-ts/core/actions/workflows/nodejs-build-prod.yaml)
[![CodeQL](https://github.com/decaf-ts/core/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/decaf-ts/core/actions/workflows/codeql-analysis.yml)[![Snyk Analysis](https://github.com/decaf-ts/core/actions/workflows/snyk-analysis.yaml/badge.svg)](https://github.com/decaf-ts/core/actions/workflows/snyk-analysis.yaml)
[![Pages builder](https://github.com/decaf-ts/core/actions/workflows/pages.yaml/badge.svg)](https://github.com/decaf-ts/core/actions/workflows/pages.yaml)
[![.github/workflows/release-on-tag.yaml](https://github.com/decaf-ts/core/actions/workflows/release-on-tag.yaml/badge.svg?event=release)](https://github.com/decaf-ts/core/actions/workflows/release-on-tag.yaml)

![Open Issues](https://img.shields.io/github/issues/decaf-ts/core.svg)
![Closed Issues](https://img.shields.io/github/issues-closed/decaf-ts/core.svg)
![Pull Requests](https://img.shields.io/github/issues-pr-closed/decaf-ts/core.svg)
![Maintained](https://img.shields.io/badge/Maintained%3F-yes-green.svg)

![Forks](https://img.shields.io/github/forks/decaf-ts/core.svg)
![Stars](https://img.shields.io/github/stars/decaf-ts/core.svg)
![Watchers](https://img.shields.io/github/watchers/decaf-ts/core.svg)

![Node Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=Node&query=$.engines.node&colorB=blue)
![NPM Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=NPM&query=$.engines.npm&colorB=purple)

Documentation [here](https://decaf-ts.github.io/injectable-decorators/), Test results [here](https://decaf-ts.github.io/injectable-decorators/workdocs/reports/html/test-report.html) and Coverage [here](https://decaf-ts.github.io/injectable-decorators/workdocs/reports/coverage/lcov-report/index.html)

Minimal size: 18.7 KB kb gzipped


# Core Package — Detailed Description

The Decaf Core package provides a cohesive set of primitives for building strongly-typed data-access layers in TypeScript. It centers around:

- Models (from @decaf-ts/decorator-validation) enhanced with identity and persistence metadata
- A Repository abstraction that encapsulates CRUD, querying, and observation
- Adapters that bridge repositories to underlying storage (in-memory, HTTP, TypeORM, etc.)
- A fluent Query DSL (Statement/Condition) with pagination
- Lightweight dependency injection utilities to auto-resolve repositories

Below is an overview of the main modules and their public APIs exposed by core.

1) Repository module
- Repository<M>
  - Constructor: new Repository(adapter: Adapter, clazz: Constructor<M>, ...)
  - CRUD: create, read, update, delete
  - Bulk ops: createAll, readAll, updateAll, deleteAll
  - Hooks: createPrefix/createSuffix, updateAllPrefix, readAllPrefix, deleteAllPrefix (internal orchestration helpers)
  - Query: select(...selectors?), query(condition?, orderBy?, order?, limit?, skip?)
  - Observation: observe(observer, filter?), unObserve(observer), updateObservers(...), refresh(...)
  - Repository registry helpers:
    - static for(config, ...args): Proxy factory for building repositories with specific adapter config
    - static forModel(model, alias?, ...args): returns a Repository instance or repository constructor registered for the model
    - static get(model, alias?): low-level retrieval of a registered repository constructor
    - static register(model, repoCtor, alias?)
    - static getMetadata/setMetadata/removeMetadata(model)
    - static getSequenceOptions(model)
    - static indexes(model): reads index definitions for model
    - static relations(model)
    - static table(model), static column(model, attribute)
- Decorators (repository/decorators)
  - repository(modelCtor, flavour?):
    - As property decorator: injects the repository instance for the annotated model
    - As class decorator: registers the annotated class as the repository for the model; integrates with Injectables
- Injectables registry (repository/injectables)
  - InjectablesRegistry extends InjectableRegistryImp
  - get<T>(name | token | ctor, flavour?): resolves a registered injectable; if not registered, attempts to infer the model and construct or fetch the appropriate repository based on adapter flavour or metadata (falling back to current adapter)
- Types/utilities (repository/types, repository/utils)
  - IndexMetadata, OrderDirection, generateInjectableNameForRepository, and other helpers/constants

2) Persistence module
- Adapter<N = any, Q = any, R = any, Ctx = Context>
  - Base bridge between repository and the back-end. Offers:
    - initialize(...), flags(...), context(...)
    - prepare(model, pk): model -> record mapping using model metadata
    - revert(record, clazz, pk, id, transient?): record -> model mapping
    - CRUD: create, createAll, read, readAll, update, updateAll, delete, deleteAll
    - raw(rawInput): pass-through for back-end specific commands
    - Observation: observe/unObserve, updateObservers, refresh
    - Flavour/alias management: current(), get(flavour), setCurrent(flavour), alias(), models(flavour), flavourOf(model)
    - Factory helpers: Statement(), Dispatch(), ObserverHandler(), Sequence(options)
    - for(config, ...args): proxy-bound adapter for a given configuration
- Dispatch: batching/dispatch helpers used by Adapter
- Sequence: provides identity/sequence generation based on SequenceOptions (see interfaces)
- ObserverHandler: internal observer list and filtering logic used by repositories/adapters
- constants, errors, types: PersistenceKeys, EventIds, ObserverFilter, etc.

3) Query module
- Statement<M extends Model>
  - Fluent DSL to build and execute queries via the configured Adapter
  - Methods:
    - select(...keys?), distinct(key), count(key), max(key), min(key)
    - from(modelCtor), where(Condition), orderBy([key, OrderDirection]), groupBy(key)
    - limit(n), offset(n), execute(), raw(input), paginate(size)
- Condition<M extends Model>
  - Composable condition tree with a builder API and logical combinators
  - Methods:
    - and(cond), or(cond), not(cond)
    - attribute/attr(name): switch attribute under construction
    - hasErrors(exceptions?): validation helper
    - group(cond1, GroupOperator, cond2)
    - builder(): ConditionBuilder
  - ConditionBuilder methods: eq, dif, gt, lt, gte, lte, in, regexp, build
- Paginator<M>
  - Abstract pagination helper returned by Statement.paginate(size)
  - Properties: current, total, count, size
  - Methods: page(n?), next(), previous(); requires an Adapter-specific concrete implementation

4) Interfaces module
- Observable<T>, Observer<T>: basic observer pattern primitives
- Executor, RawExecutor: contracts for query execution
- Queriable: minimal interface for types that can return a Statement
- Paginatable: marks types that can paginate
- SequenceOptions and defaults: sequence/generator configuration presets

5) Model & Identity modules
- BaseModel and supporting types: base class all models extend from
- identity/decorators and identity/utils: helpers to derive table names, etc.
- model/decorators: e.g., @model and other persistence-related metadata (provided by @decaf-ts/decorator-validation and enriched here)

6) RAM runtime (core/src/ram)
- RamAdapter, RamRepository, RamStatement, RamPaginator (in-memory implementations used by tests and examples)
- Useful for local testing and reference behavior of the core abstractions.

Design intent
- Provide a consistent, typed data access layer decoupled from any particular storage or framework
- Allow adapters to plug into multiple backends while preserving a uniform repository and query API
- Make querying expressive but type-safe through fluent builders and model metadata
- Enable DI and decorators for ergonomic repository wiring and testing


# How To Use — Core Package

Below are practical, focused examples for the public APIs exposed by the Core package. Each example includes a short description and valid TypeScript code. Examples are inspired by and aligned with the unit tests under core/tests.

Prerequisites used across examples:
- Ensure your model builder is set for tests/dev scenarios: Model.setBuilder(Model.fromModel)
- Use the RAM adapter for quick in-memory demos
```typescript
import { Model, model } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import {
  Adapter,
  OrderDirection,
  Paginator,
  Repository,
  repository,
  uses,
  pk,
  column,
  table,
} from "@decaf-ts/core";
import { RamAdapter, RamRepository } from "@decaf-ts/core/ram";

@table("tst_user")
@model()
class User extends Model {
  @pk() id!: string;
  @column("tst_name") name!: string;
  @column("tst_nif") nif!: string;
  constructor(arg?: ModelArg<User>) { super(arg); }
}
```


- Repository + RAM adapter: basic CRUD
Description: Create a RamAdapter and a Repository for a model and perform CRUD operations; mirrors core/tests/unit/RamAdapter.test.ts and adapter.test.ts.
```typescript
import { NotFoundError } from "@decaf-ts/db-decorators";

async function crudExample() {
  const adapter = new RamAdapter();
  const repo: RamRepository<User> = new Repository(adapter, User);

  // CREATE
  const created = await repo.create(
    new User({ id: Date.now().toString(), name: "Alice", nif: "123456789" })
  );

  // READ
  const read = await repo.read(created.id);
  console.log(read.equals(created)); // true (same data, different instance)

  // UPDATE
  const updated = await repo.update(Object.assign(read, {name: "Alice 2" }));

  // DELETE
  const deleted = await repo.delete(created.id);
  console.log(deleted.equals(updated)); // true
}
```


- Adapter current and registered models; @repository class decorator
Description: Show how to set/get current adapter and register a repository via the @repository decorator; mirrors adapter.test.ts.
```typescript

@model()
class Managed extends Model { constructor(arg?: ModelArg<Managed>) { super(arg); } }

@repository(Managed)
@uses("ram")
class ManagedRepository extends Repository<Managed> {
  // Concrete adapter-backed methods would be provided by adapter implementation
  // For quick test or demo, use a RamAdapter
}

async function adapterRegistryExample() {
  const adapter = new RamAdapter();

  Adapter.setCurrent("ram"); // set current flavour
  console.log(Adapter.current === Adapter.get("ram")); // true

  // Models managed by current or specific adapter flavour
  const managed = Adapter.models("ram");
  console.log(Array.isArray(managed));
}
```

- Query building with select/order and execution
Description: Build a statement with orderBy and run it, as done in core/tests/unit/Pagination.test.ts.

```typescript
async function queryExample() {
  const adapter = new RamAdapter();
  const repo: RamRepository<User> = new Repository(adapter, User);

  // Seed data
  await repo.createAll(
    Array.from({ length: 5 }).map((_, i) =>
      new User({ id: (i + 1).toString(), name: `u${i + 1}`, nif: "123456789" })
    )
  );

  const results = await repo
    .select()
    .orderBy(["id", OrderDirection.ASC])
    .execute();

  console.log(results.map((u) => u.id)); // ["1","2","3","4","5"]
}
```

- Pagination with Paginator
Description: Paginate query results using Statement.paginate(size), then page through results; mirrors Pagination.test.ts.

```typescript
async function paginationExample() {
  const adapter = new RamAdapter();
  const repo: RamRepository<User> = new Repository(adapter, User);

  // Seed data
  const size = 25;
  await repo.createAll(
    Array.from({ length: size }).map((_, i) =>
      new User({ id: (i + 1).toString(), name: `u${i + 1}`, nif: "123456789" })
    )
  );

  const paginator: Paginator<User> = await repo
    .select()
    .orderBy(["id", OrderDirection.DSC])
    .paginate(10);

  const page1 = await paginator.page(); // first page by default
  const page2 = await paginator.next();
  const page3 = await paginator.next();

  console.log(page1.length, page2.length, page3.length); // 10, 10, 5
}
```


- Conditions: building filters
Description: Compose conditions with the builder and apply them in a where clause.
```typescript
import { Condition } from "@decaf-ts/core";

async function conditionExample() {
  const adapter = new RamAdapter();
  const repo: RamRepository<User> = new Repository(adapter, User);

  await repo.createAll([
    new User({ id: "1", name: "Alice", nif: "111111111" }),
    new User({ id: "2", name: "Bob", nif: "222222222" }),
  ]);

  const cond = Condition.attr<User>("name")
    .eq("Alice")
    .build();

  const results = await repo.select().where(cond).execute();
  console.log(results.length); // 1
}
```


- Adapter mapping: prepare and revert
Description: Convert a model to a storage record and back using Adapter.prepare and Adapter.revert; mirrors adapter.test.ts.
```typescript
async function mappingExample() {
  const adapter = new RamAdapter();
  const repo: RamRepository<User> = new Repository(adapter, User);

  const toCreate = new User({ id: "abc", name: "Test", nif: "123456789" });

  // prepare: model -> record
  const pk = "id"; // infer with findPrimaryKey(toCreate).id if available
  const { record, id } = adapter.prepare(toCreate, pk);
  console.log(id === toCreate.id); // true

  // revert: record -> model instance
  const model = adapter.revert(record, User, pk, id) as User;
  console.log(model instanceof User); // true
}
```


- Auto-resolving repositories with InjectablesRegistry
Description: Retrieve a repository by model name or constructor using the DI registry; see repository/injectables.ts flow.
```typescript
import { Injectables } from "@decaf-ts/injectable-decorators";
import { InjectablesRegistry } from "@decaf-ts/core";

async function injectablesExample() {
  // Register current adapter so repositories can be created
  new RamAdapter();
  Adapter.setCurrent("ram");

  // Resolve by constructor
  const userRepo = Injectables.get<Repository<User>>(User);
  if (userRepo) {
    const u = await userRepo.create(
      new User({ id: "1", name: "A", nif: "123456789" })
    );
    console.log(!!u);
  }
}
```


## Coding Principles

- group similar functionality in folders (analog to namespaces but without any namespace declaration)
- one class per file;
- one interface per file (unless interface is just used as a type);
- group types as other interfaces in a types.ts file per folder;
- group constants or enums in a constants.ts file per folder;
- group decorators in a decorators.ts file per folder;
- always import from the specific file, never from a folder or index file (exceptions for dependencies on other packages);
- prefer the usage of established design patters where applicable:
  - Singleton (can be an anti-pattern. use with care);
  - factory;
  - observer;
  - strategy;
  - builder;
  - etc;

## Release Documentation Hooks
Stay aligned with the automated release pipeline by reviewing [Release Notes](./workdocs/reports/RELEASE_NOTES.md) and [Dependencies](./workdocs/reports/DEPENDENCIES.md) after trying these recipes (updated on 2025-11-26).


### Related

[![decaf-ts](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=decaf-ts)](https://github.com/decaf-ts/decaf-ts)
[![decorator-validation](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=decorator-validation)](https://github.com/decaf-ts/decorator-validation)
[![db-decorators](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=db-decorators)](https://github.com/decaf-ts/db-decorators)


### Social

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/decaf-ts/)




#### Languages

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![ShellScript](https://img.shields.io/badge/Shell_Script-121011?style=for-the-badge&logo=gnu-bash&logoColor=white)

## Getting help

If you have bug reports, questions or suggestions please [create a new issue](https://github.com/decaf-ts/ts-workspace/issues/new/choose).

## Contributing

I am grateful for any contributions made to this project. Please read [this](./workdocs/98-Contributing.md) to get started.

## Supporting

The first and easiest way you can support it is by [Contributing](./workdocs/98-Contributing.md). Even just finding a typo in the documentation is important.

Financial support is always welcome and helps keep both me and the project alive and healthy.

So if you can, if this project in any way. either by learning something or simply by helping you save precious time, please consider donating.

## License

This project is released under the [Mozilla Public License 2.0](./LICENSE.md).

By developers, for developers...
