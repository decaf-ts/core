# Core Package — Detailed Description

The Decaf Core package provides a cohesive set of primitives for building strongly-typed data-access layers and managing background tasks in TypeScript. It centers around:

- Models (from @decaf-ts/decorator-validation) enhanced with identity and persistence metadata.
- A Repository abstraction that encapsulates CRUD, querying, and observation.
- A powerful Task Engine for defining, scheduling, and executing background jobs with support for worker threads.
- Adapters that bridge repositories to underlying storage (in-memory, HTTP, TypeORM, etc.).
- A fluent Query DSL (Statement/Condition) with pagination.
- Lightweight dependency injection utilities to auto-resolve repositories.

Below is an overview of the main modules and their public APIs exposed by core.

## 1. Repository Module
- **`Repository<M>`**
  - Constructor: `new Repository(adapter: Adapter, clazz: Constructor<M>, ...)`
  - CRUD: `create`, `read`, `update`, `delete`
  - Bulk ops: `createAll`, `readAll`, `updateAll`, `deleteAll`
  - Querying:
    - `select(...selectors?)`: Start a fluent query chain.
    - `query(condition?, orderBy?, order?, limit?, skip?)`: Execute a simple query.
    - **New High-Level Queries:** A set of methods, often used with the `@prepared` decorator, for common query patterns:
      - `find(value, order?)`: Searches default attributes of a model for partial matches (starts-with).
      - `findBy(key, value)`: Finds records by a specific attribute-value pair.
      - `findOneBy(key, value)`: Finds a single record or throws a `NotFoundError`.
      - `listBy(key, order)`: Lists all records ordered by a specific key.
      - `countOf(key?)`: Counts records, optionally for a specific attribute.
      - `maxOf(key)`, `minOf(key)`, `avgOf(key)`, `sumOf(key)`: Perform aggregate calculations.
      - `distinctOf(key)`: Retrieves distinct values for an attribute.
      - `groupOf(key)`: Groups records by a given attribute.
      - `page(value, direction?, ref?)`: Paginates through records matching a default partial-match query.
      - `paginateBy(key, order, ref?)`: Paginates records ordered by a specific key.
  - Observation: `observe(observer, filter?)`, `unObserve(observer)`, `updateObservers(...)`, `refresh(...)`
  - **Statement Execution**:
    - `statement(name, ...args)`: Executes a custom method on the repository decorated with `@prepared`.
  - Repository registry helpers:
    - `static for(config, ...args)`: Proxy factory for building repositories with specific adapter config.
    - `static forModel(model, alias?, ...args)`: Returns a Repository instance for a model.
    - `static register(model, repoCtor, alias?)`: Registers a repository for a model.

- **Decorators (`repository/decorators`)**
  - `@repository(modelCtor, flavour?)`: Injects a repository instance or registers a repository class.
  - `@prepared()`: Marks a repository method as an executable "prepared statement", allowing it to be called via `repository.statement()`.

## 2. Task Engine Module
A robust system for managing background jobs.
- **`TaskEngine<A>`**: The core engine that polls for and executes tasks. Manages the task lifecycle, concurrency, and worker threads.
- **`TaskService<A>`**: A high-level service providing a clean API for interacting with the `TaskEngine`. It's the recommended entry point for managing tasks.
  - `push(task, track?)`: Submits a new task for execution.
  - `schedule(task, track?).for(date)`: Schedules a task to run at a specific time.
  - `track(id)`: Returns a `TaskTracker` to monitor an existing task.
- **Models**:
  - `TaskModel`: Represents a task, its status (`PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`), input, and configuration (e.g., `maxAttempts`, `backoff`). Can be `ATOMIC` or `COMPOSITE`.
  - `TaskEventModel`: Logs status changes and progress for a task.
- **Builders**:
  - `TaskBuilder`: A fluent API for constructing `TaskModel` instances.
  - `CompositeTaskBuilder`: A builder for creating multi-step (`COMPOSITE`) tasks.
- **Handlers & Tracking**:
  - `ITaskHandler`: The interface to implement for defining the logic of a task. Handlers are registered with the `TaskHandlerRegistry`.
  - `TaskTracker`: An object returned when tracking a task, allowing you to await its completion and receive progress updates.
- **Worker Threads**: The engine can be configured to run tasks in Node.js `worker_threads`, providing true parallelism and non-blocking execution for CPU-intensive jobs. Configuration is done via the `workerPool` and `workerAdapter` properties in the `TaskEngineConfig`.

## 3. Persistence Module
- **`Adapter<N, Q, R, Ctx>`**: The bridge between a repository and the back-end storage.
  - Handles CRUD operations, raw queries, and model/record transformation (`prepare`/`revert`).
  - Manages different storage "flavours" (e.g., 'ram', 'fs', 'typeorm').
- **`Sequence`**: Provides identity/sequence generation.
- **`ObserverHandler`**: Manages observer notifications.

## 4. Query Module
- **`Statement<M>`**: A fluent DSL for building and executing queries.
  - Methods: `select`, `from`, `where`, `orderBy`, `groupBy`, `limit`, `offset`, `execute`, `paginate`.
  - Now includes enhanced logic to "squash" simple queries into efficient prepared statements.
- **`Condition<M>`**: A composable condition tree for building `where` clauses.
- **`Paginator<M>`**: An abstract pagination helper.
  - Now includes `serialize()` and `deserialize()` methods to easily pass pagination state.

## 5. Model & Identity Modules
- **`BaseModel`**: The base class all models extend from.
- Decorators like `@table`, `@pk`, `@column`, `@index`, and relation decorators (`@oneToOne`, `@oneToMany`, `@manyToOne`) are used to define persistence metadata.
- Includes updated logic for handling complex relations, including `oneToManyOnCreateUpdate` and initial support for `manyToMany`.

## 6. RAM & Filesystem Runtimes
- **`RamAdapter`**: An in-memory adapter, perfect for tests and quick prototyping.
- **`FilesystemAdapter`**: A `RamAdapter`-compatible adapter that persists data to the local filesystem, enabling data to survive process restarts. Ideal for local development and testing.
