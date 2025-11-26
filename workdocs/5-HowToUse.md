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
