![Banner](./workdocs/assets/Banner.png)

## Core Module

The Decaf TypeScript Core Module is a comprehensive framework that provides a robust foundation for building TypeScript applications with data persistence capabilities. It offers a flexible model-repository architecture with support for various storage mechanisms, relationship management, querying capabilities, and reactive programming through the Observer pattern. The framework simplifies data handling with decorators for model definition, identity management, and persistence operations while maintaining type safety throughout.


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

Documentation available [here](https://decaf-ts.github.io/core/)

### Description

The Decaf TypeScript Core Module is a sophisticated framework designed to streamline data persistence and model management in TypeScript applications. Building upon the foundation of `db-decorators`, `decorator-validation`, and `injectable-decorators`, it provides a comprehensive solution for working with data models across various storage mechanisms.

#### Architecture Overview

The framework is organized into several key modules:

1. **Model System**: At the heart of the framework is the `BaseModel` class, which serves as the foundation for all domain models. It provides automatic timestamp tracking and integrates with the validation system. The model system supports:
   - Property decorators for defining model attributes
   - Relationship decorators (`@oneToOne`, `@oneToMany`, `@manyToOne`) for defining associations between models
   - Table and column mapping through `@table` and `@column` decorators
   - Indexing capabilities with the `@index` decorator

2. **Identity Management**: The framework includes robust identity handling with:
   - Primary key generation through the `@pk` decorator
   - Sequence generation for automatic ID assignment
   - Utilities for table name resolution and sequence naming

3. **Repository Pattern**: The repository module provides a clean abstraction for data access operations:
   - CRUD operations (create, read, update, delete)
   - Transaction support
   - Relationship management with cascade operations
   - Custom repository implementations through decorators

4. **Query System**: A flexible query builder allows for:
   - Condition-based filtering
   - Property selection
   - Pagination
   - Sorting and ordering
   - Statement execution

5. **Persistence Layer**: The adapter-based persistence system:
   - Abstracts away storage implementation details
   - Supports multiple storage backends
   - Provides sequence management
   - Implements the Observer pattern for reactive updates

6. **RAM Implementation**: An in-memory implementation of the persistence layer for:
   - Testing purposes
   - Prototyping
   - Caching

#### Key Features

- **Type Safety**: Leverages TypeScript's type system to provide compile-time checks
- **Decorator-Based Configuration**: Uses decorators for clean, declarative model definitions
- **Relationship Management**: Handles one-to-one, one-to-many, and many-to-one relationships with automatic cascading
- **Flexible Storage**: Works with any storage mechanism through the adapter pattern
- **Reactive Updates**: Implements the Observer pattern for reactive programming
- **Dependency Injection**: Integrates with dependency injection for flexible component wiring
- **Raw Access**: Provides direct access to the underlying storage when needed
- **Automatic Timestamps**: Tracks creation and update times automatically

The Core Module is designed to be extensible and developer-friendly, reducing boilerplate code while providing powerful features for data management in TypeScript applications.


### How to Use

- [Initial Setup](../../workdocs/tutorials/For%20Developers.md#_initial-setup_)
- [Installation](../../workdocs/tutorials/For%20Developers.md#installation)

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

This project is released under the [AGPL-3.0-or-later License](./LICENSE.md).

By developers, for developers...