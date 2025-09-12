### How to Use

- [Initial Setup](./workdocs/tutorials/For%20Developers.md#_initial-setup_)
- [Installation](./workdocs/tutorials/For%20Developers.md#installation)

## Table of Contents

- [Model Definition](#model-definition)
- [Identity Management](#identity-management)
- [Relationships](#relationships)
- [Repository Operations](#repository-operations)
- [Querying](#querying)
- [Persistence](#persistence)
- [Observer Pattern](#observer-pattern)

## Model Definition

### Basic model with validation and indexes

Description: Define a model using decorator-validation and core model decorators. This follows the pattern from integration tests.

```typescript
import { Model, model, required, minlength, min, type } from '@decaf-ts/decorator-validation';
import { BaseModel, pk, index, OrderDirection, readonly } from '@decaf-ts/core';

@model()
class User extends BaseModel {
  @pk({ type: 'Number' })
  id!: number;

  @required()
  @min(18)
  @index([OrderDirection.DSC, OrderDirection.ASC])
  age!: number;

  @required()
  @minlength(5)
  name!: string;

  @required()
  @readonly()
  @type([String.name])
  sex!: 'M' | 'F';

  constructor(arg?: Partial<User>) {
    super(arg);
  }
}
```

## Identity Management

### Primary key generation with sequences (@pk)

Description: Use @pk to mark the primary key. When a numeric/bigint type is configured, IDs can be generated via sequences.

```typescript
import { BaseModel, pk } from '@decaf-ts/core';
import { model, Model } from '@decaf-ts/decorator-validation';

@model()
class Order extends BaseModel {
  @pk({ type: 'Number' })
  id!: number;
}
```

## Repository Operations

### Constructing a repository and CRUD

Description: Instantiate a Repository with a specific Adapter and perform create, read, update and delete while observing events. Matches unit repository.test.

```typescript
import { Repository, OperationKeys } from '@decaf-ts/core';
import { RamAdapter } from '@decaf-ts/core/ram';
import { model, Model } from '@decaf-ts/decorator-validation';

@model()
class Thing extends Model {
  id!: string;
  name!: string;
}

const adapter = new RamAdapter();
const repo = new Repository(adapter, Thing);

// Observe changes
const mock = jest.fn();
const observer = { async refresh(...args: any[]) { mock(...args); } };
repo.observe(observer);

// Create
const created = await repo.create(new Thing({ id: Date.now().toString(), name: 'n' }));

// Read
const read = await repo.read(created.id);

// Update
const updated = await repo.update(new Thing({ id: created.id, name: 'new' }));

// Delete
const deleted = await repo.delete(created.id);

repo.unObserve(observer);
```

### Bulk operations

Description: Create, read, update and delete in bulk. Matches integration bulk.test.

```typescript
import { Repository } from '@decaf-ts/core';
import { RamAdapter } from '@decaf-ts/core/ram';
import { model, Model } from '@decaf-ts/decorator-validation';

@model()
class Item extends Model { id!: string; value!: number; }

const adapter = new RamAdapter();
const repo = new Repository(adapter, Item);

const models = Array.from({ length: 5 }, (_, i) => new Item({ id: `${i+1}`, value: i }));

const created = await repo.createAll(models);
const readAll = await repo.readAll(created.map(m => m.id));

const updated = await repo.updateAll(readAll.map(m => new Item({ id: m.id, value: m.value + 1 })));

const deleted = await repo.deleteAll(updated.map(m => m.id));
```

### Repository registry and @uses adapter selection

Description: Register adapter “flavour” on a model to let Repository.forModel resolve the repository without manually passing an adapter. Matches unit repository.test and multipleDB patterns.

```typescript
import { uses, Repository, Repo } from '@decaf-ts/core';
import { model, BaseModel } from '@decaf-ts/decorator-validation';

@uses('ram')
@model()
class Customer extends BaseModel {}

const repo = Repository.forModel<Customer, Repo<Customer>>(Customer);
```

## Querying

### Selecting all and selecting specific attributes

Description: Use select() to fetch full models, or pass a list of attribute keys to fetch partials. Matches integration query.test.

```typescript
import { Repository } from '@decaf-ts/core';
import { RamAdapter } from '@decaf-ts/core/ram';

const repo = new Repository(new RamAdapter(), User);

const all = await repo.select().execute();
const partials = await repo.select(['age', 'sex']).execute();
```

### Conditional queries with Condition builder

Description: Build conditions with Condition.attribute(...).eq/dif/gt/gte/lt/lte/in/regexp and compose with and/or/not/group. Matches integration query.test.

```typescript
import { Condition } from '@decaf-ts/core';

// Equal
const eq20 = Condition.attribute<User>('age').eq(20);
const age20 = await repo.select().where(eq20).execute();

// AND
const adultsMale = await repo
  .select()
  .where(Condition.attribute<User>('age').gte(18).and(Condition.attribute<User>('sex').eq('M')))
  .execute();

// OR
const nineteenOrTwenty = await repo
  .select()
  .where(Condition.attribute<User>('age').eq(20).or(Condition.attribute<User>('age').eq(19)))
  .execute();
```

### Ordering results

Description: Sort results using orderBy with [key, OrderDirection]. Matches integration query.test.

```typescript
import { OrderDirection } from '@decaf-ts/core';

const byNameDesc = await repo.select().orderBy(['name', OrderDirection.DSC]).execute();
const byAgeDesc = await repo.select().orderBy(['age', OrderDirection.DSC]).execute();
```

## Pagination

Description: Obtain a Paginator from a select() statement and navigate pages. Matches integration Pagination.test.

```typescript
import { Paginator, OrderDirection } from '@decaf-ts/core';

const paginator: Paginator<User> = await repo
  .select()
  .orderBy(['id', OrderDirection.DSC])
  .paginate(10);

const page1 = await paginator.page(1);
const page2 = await paginator.next();
const page1Again = await paginator.previous();
```

## Persistence and Adapters

### RamAdapter and repository typing

Description: Use the in-memory RamAdapter for testing or prototyping. You can narrow the repository type using RamRepository from ram/types as seen in tests.

```typescript
import { Repository } from '@decaf-ts/core';
import { RamAdapter } from '@decaf-ts/core/ram';
import type { RamRepository } from '@decaf-ts/core/ram/types';

const repo: RamRepository<User> = Repository.forModel<User, RamRepository<User>>(User);

// Or instantiate directly
const direct = new Repository(new RamAdapter(), User);
```

## Observation (Observer Pattern)

Description: Register/unregister Observer instances on repositories; refresh will be called on CREATE/UPDATE/DELETE.

```typescript
import { Repository, OperationKeys } from '@decaf-ts/core';
import { RamAdapter } from '@decaf-ts/core/ram';

const repo = new Repository(new RamAdapter(), User);
const mock = jest.fn();
const observer = { async refresh(...args: any[]) { mock(...args); } };

repo.observe(observer);
await repo.create(new User({ id: '1', age: 21, name: 'user_1', sex: 'M' }));
await repo.update(new User({ id: '1', age: 21, name: 'user_1x', sex: 'M' }));
await repo.delete('1');
repo.unObserve(observer);
```

## Dependency Injection with @repository

### Injecting repositories into classes

Description: Use the @repository decorator for property injection or to decorate custom repository classes. Matches unit repository.test.

```typescript
import { repository, Repo, Repository, uses, Adapter } from '@decaf-ts/core';
import { model, BaseModel } from '@decaf-ts/decorator-validation';

@uses('ram')
@model()
class Account extends BaseModel {}

class Service {
  @repository(Account)
  repo!: Repo<Account>;
}

const service = new Service();
// service.repo is a Repository<Account> instance bound to the 'ram' adapter

// Custom repository class
@repository(Account)
@uses('ram')
class AccountRepo extends Repository<Account, any, Adapter<any, any, any, any>> {
  constructor(adapter: Adapter<any, any, any, any>) { super(adapter); }
}

const registered = Repository.forModel(Account); // instance of AccountRepo
```
