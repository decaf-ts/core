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
