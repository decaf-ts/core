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

### Creating a Basic Model

Define a domain model by extending the BaseModel class and using decorators to define properties.

```typescript
import { BaseModel, required, email, pk } from '@decaf-ts/core';

class User extends BaseModel {
  @pk()
  id!: string;

  @required()
  username!: string;

  @email()
  email!: string;

  @required()
  firstName!: string;

  @required()
  lastName!: string;

  constructor(data?: Partial<User>) {
    super(data);
  }
}

// Create a new user
const user = new User({
  username: 'johndoe',
  email: 'john.doe@example.com',
  firstName: 'John',
  lastName: 'Doe'
});
```

### Customizing Table and Column Names

Use the `@table` and `@column` decorators to customize database table and column names.

```typescript
import { BaseModel, required, table, column, pk } from '@decaf-ts/core';

@table('app_users')
class User extends BaseModel {
  @pk()
  id!: string;

  @required()
  username!: string;

  @required()
  @column('user_email')
  email!: string;

  @column('first_name')
  firstName!: string;

  @column('last_name')
  lastName!: string;

  constructor(data?: Partial<User>) {
    super(data);
  }
}
```

### Creating Indexes

Use the `@index` decorator to create database indexes for better query performance.

```typescript
import { BaseModel, required, index, pk, OrderDirection } from '@decaf-ts/core';

class Product extends BaseModel {
  @pk()
  id!: string;

  @required()
  @index([OrderDirection.ASC])
  name!: string;

  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  price!: number;

  @required()
  category!: string;

  constructor(data?: Partial<Product>) {
    super(data);
  }
}
```

## Identity Management

### Using Primary Keys with Automatic Sequence Generation

The `@pk` decorator marks a property as the primary key and sets up automatic sequence generation.

```typescript
import { BaseModel, pk, required } from '@decaf-ts/core';

class Order extends BaseModel {
  @pk({ type: 'Number' })
  id!: number;

  @required()
  customerId!: string;

  @required()
  totalAmount!: number;

  constructor(data?: Partial<Order>) {
    super(data);
  }
}

// The id will be automatically generated when the order is saved
const order = new Order({
  customerId: 'cust123',
  totalAmount: 99.99
});
```

### Custom Sequence Options

Customize the sequence generation for primary keys.

```typescript
import { BaseModel, pk, required } from '@decaf-ts/core';

class Invoice extends BaseModel {
  @pk({
    type: 'BigInt',
    name: 'invoice_sequence',
    startWith: 1000,
    incrementBy: 1
  })
  invoiceNumber!: bigint;

  @required()
  orderId!: number;

  @required()
  amount!: number;

  constructor(data?: Partial<Invoice>) {
    super(data);
  }
}
```

## Relationships

### One-to-One Relationships

Define a one-to-one relationship between models.

```typescript
import { BaseModel, pk, required, oneToOne } from '@decaf-ts/core';

class User extends BaseModel {
  @pk()
  id!: string;

  @required()
  username!: string;

  @oneToOne(Profile)
  profile?: Profile;

  constructor(data?: Partial<User>) {
    super(data);
  }
}

class Profile extends BaseModel {
  @pk()
  id!: string;

  @required()
  userId!: string;

  bio?: string;

  avatarUrl?: string;

  constructor(data?: Partial<Profile>) {
    super(data);
  }
}
```

### One-to-Many Relationships

Define a one-to-many relationship between models.

```typescript
import { BaseModel, pk, required, oneToMany } from '@decaf-ts/core';

class Author extends BaseModel {
  @pk()
  id!: string;

  @required()
  name!: string;

  @oneToMany(Book)
  books?: Book[];

  constructor(data?: Partial<Author>) {
    super(data);
  }
}

class Book extends BaseModel {
  @pk()
  id!: string;

  @required()
  title!: string;

  @required()
  authorId!: string;

  constructor(data?: Partial<Book>) {
    super(data);
  }
}
```

### Many-to-One Relationships

Define a many-to-one relationship between models.

```typescript
import { BaseModel, pk, required, manyToOne } from '@decaf-ts/core';

class Book extends BaseModel {
  @pk()
  id!: string;

  @required()
  title!: string;

  @required()
  authorId!: string;

  @manyToOne(Author)
  author?: Author;

  constructor(data?: Partial<Book>) {
    super(data);
  }
}

class Author extends BaseModel {
  @pk()
  id!: string;

  @required()
  name!: string;

  constructor(data?: Partial<Author>) {
    super(data);
  }
}
```

## Repository Operations

### Basic CRUD Operations

Perform basic CRUD operations using a repository.

```typescript
import { Repository, BaseModel, pk, required } from '@decaf-ts/core';

class User extends BaseModel {
  @pk({ type: 'Number' })
  id!: string;

  @required()
  username!: string;

  @required()
  email!: string;

  constructor(data?: Partial<User>) {
    super(data);
  }
}

// Create a repository for the User model
const userRepository = new Repository(User);

// Create a new user
async function createUser() {
  const user = new User({
    username: 'johndoe',
    email: 'john.doe@example.com'
  });

  const createdUser = await userRepository.create(user);
  console.log('User created with ID:', createdUser.id);
  return createdUser;
}

// Read a user by ID
async function getUserById(id: string) {
  const user = await userRepository.read(id);
  console.log('User found:', user);
  return user;
}

// Update a user
async function updateUser(user: User) {
  user.email = 'new.email@example.com';
  const updatedUser = await userRepository.update(user);
  console.log('User updated');
  return updatedUser;
}

// Delete a user
async function deleteUser(user: User) {
  await userRepository.delete(user);
  console.log('User deleted');
}
```

## Querying

### Basic Queries

Perform basic queries using conditions.

```typescript
import { Repository, BaseModel, pk, required, Condition } from '@decaf-ts/core';

class Product extends BaseModel {
  @pk()
  id!: string;

  @required()
  name!: string;

  @required()
  price!: number;

  @required()
  category!: string;

  constructor(data?: Partial<Product>) {
    super(data);
  }
}

const productRepository = new Repository(Product);

// Find products by category
async function findProductsByCategory(category: string) {
  const condition = Condition.eq('category', category);
  const products = await productRepository.find(condition);
  console.log(`Found ${products.length} products in category ${category}`);
  return products;
}

// Find products with price greater than a value
async function findExpensiveProducts(minPrice: number) {
  const condition = Condition.gt('price', minPrice);
  const products = await productRepository.find(condition);
  console.log(`Found ${products.length} products with price > ${minPrice}`);
  return products;
}

// Find products with complex conditions
async function findSpecificProducts() {
  const condition = Condition.and(
    Condition.eq('category', 'electronics'),
    Condition.or(
      Condition.lt('price', 500),
      Condition.gt('price', 1000)
    )
  );
  const products = await productRepository.find(condition);
  console.log(`Found ${products.length} specific products`);
  return products;
}
```

### Pagination

Use pagination to handle large result sets.

```typescript
import { Repository, BaseModel, pk, required, OrderDirection } from '@decaf-ts/core';

class Product extends BaseModel {
  @pk()
  id!: string;

  @required()
  name!: string;

  @required()
  price!: number;

  constructor(data?: Partial<Product>) {
    super(data);
  }
}

const productRepository = new Repository(Product);

// Get paginated results
async function getProductsPage(pageNumber: number, pageSize: number) {
  const result = await productRepository.select()
    .orderBy('name', OrderDirection.ASC)
    .paginate(pageSize)
    .page()

  console.log(`Page ${pageNumber}: ${result.length} products`);
  console.log(`Total pages: ${result.totalPages}`);
  console.log(`Total items: ${result.totalItems}`);

  return result;
}
```

### Property Selection

Select specific properties from models.

```typescript
import { Repository, BaseModel, pk, required } from '@decaf-ts/core';

class User extends BaseModel {
  @pk()
  id!: string;

  @required()
  username!: string;

  @required()
  email!: string;

  @required()
  password!: string;

  constructor(data?: Partial<User>) {
    super(data);
  }
}

const userRepository = new Repository(User);

// Select only specific properties
async function getUsersPublicInfo() {
  const users = await userRepository
    .select(['id', 'username', 'email'])
    .execute();

  // The returned objects will only have id, username, and email properties
  console.log('Users public info:', users);
  return users;
}
```

## Persistence

### Using Different Adapters

Configure and use different persistence adapters.

```typescript
import { 
  Adapter, 
  RamAdapter, 
  Repository, 
  BaseModel, 
  pk, 
  required 
} from '@decaf-ts/core';

class User extends BaseModel {
  @pk()
  id!: string;

  @required()
  username!: string;

  constructor(data?: Partial<User>) {
    super(data);
  }
}

// Use RAM adapter for in-memory storage (useful for testing)
const ramAdapter = new RamAdapter();
const userRepository = new Repository(User, { adapter: ramAdapter });

// Example with a hypothetical SQL adapter
// const sqlAdapter = new SqlAdapter({
//   host: 'localhost',
//   port: 5432,
//   database: 'myapp',
//   username: 'user',
//   password: 'password'
// });
// const userRepository = new Repository(User, { adapter: sqlAdapter });

async function testRepository() {
  // Create a user
  const user = new User({ username: 'testuser' });
  await userRepository.create(user);

  // Read the user
  const retrievedUser = await userRepository.read(user.id);
  console.log('Retrieved user:', retrievedUser);
}
```

## Observer Pattern

### Implementing an Observer

Create an observer to react to changes in observable objects.

```typescript
import { Observer, Observable } from '@decaf-ts/core';

// Create a custom observer
class LoggingObserver implements Observer {
  async refresh(...args: any[]): Promise<void> {
    console.log('Observable was updated with args:', args);
  }
}

// Example usage with a hypothetical observable repository
class ObservableRepository implements Observable {
  private observers: Observer[] = [];

  observe(observer: Observer): void {
    this.observers.push(observer);
    console.log('Observer registered');
  }

  unObserve(observer: Observer): void {
    this.observers = this.observers.filter(obs => obs !== observer);
    console.log('Observer unregistered');
  }

  async updateObservers(...args: any[]): Promise<void> {
    console.log('Notifying observers...');
    for (const observer of this.observers) {
      await observer.refresh(...args);
    }
  }

  // Example method that triggers an update
  async performAction(action: string): Promise<void> {
    console.log(`Performing action: ${action}`);
    await this.updateObservers(action, new Date());
  }
}

// Usage
async function demonstrateObserverPattern() {
  const repository = new ObservableRepository();
  const logger = new LoggingObserver();

  // Register the observer
  repository.observe(logger);

  // Perform an action that will notify the observer
  await repository.performAction('save');

  // Unregister the observer
  repository.unObserve(logger);

  // This action won't be logged by the observer
  await repository.performAction('delete');
}
```


### Adapter Selection with @uses

Description: Specify which persistence adapter flavor a model should use via the uses decorator so Repository.forModel knows which adapter to instantiate.

```typescript
import { model, BaseModel } from '@decaf-ts/decorator-validation';
import { uses, Repository, Repo } from '@decaf-ts/core';

@uses('ram')
@model()
class StandardRepoTestModel extends BaseModel {}

// Later, obtain a repository without manually passing an adapter
const repo = Repository.forModel(StandardRepoTestModel);
// repo is a Repo<StandardRepoTestModel> backed by the 'ram' adapter
```

### Observing Repository Events

Description: React to CREATE, UPDATE, and DELETE events by registering an Observer on a repository.

```typescript
import { Repository, OperationKeys } from '@decaf-ts/core';
import { RamAdapter } from '@decaf-ts/core/ram';
import { model, Model } from '@decaf-ts/decorator-validation';

@model()
class Thing extends Model {}

const adapter = new RamAdapter();
const repo = new Repository(adapter, Thing);

// Minimal observer implementation
const mock = jest.fn();
const observer = {
  async refresh(table: string, op: OperationKeys, id?: string) {
    mock(table, op, id);
  }
};

repo.observe(observer);

// Perform operations and receive callbacks
const created = await repo.create(new Thing({ id: '1' }));
await repo.update(new Thing({ id: created.id }));
await repo.delete(created.id);

repo.unObserve(observer);
```

### Pagination with Paginator

Description: Use the query builder to order results and paginate through them with a fixed-size Paginator.

```typescript
import { Repository, OrderDirection, Paginator } from '@decaf-ts/core';
import { RamAdapter } from '@decaf-ts/core/ram';
import { model, Model } from '@decaf-ts/decorator-validation';

@model()
class Country extends Model {
  id!: number;
  name!: string;
}

const adapter = new RamAdapter();
const repo = new Repository(adapter, Country);

// Seed some data
await repo.createAll(
  Array.from({ length: 25 }, (_, i) => new Country({ id: i + 1, name: `c${i+1}` }))
);

// Order descending by id and paginate with size 10
const paginator: Paginator<Country> = await repo
  .select()
  .orderBy(['id', OrderDirection.DSC])
  .paginate(10);

const page1 = await paginator.page(); // items 25..16
const page2 = await paginator.next(); // items 15..6
const page3 = await paginator.next(); // items 5..1
```
