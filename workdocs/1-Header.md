![Banner](./workdocs/assets/decaf-logo.svg)

# Decaf TS — Core Package

Decaf Core provides the foundational building blocks for the Decaf TypeScript ecosystem: strongly-typed models, repository pattern, pluggable persistence adapters, a composable query DSL, and pagination/observer utilities. With decorators and an injectable registry, it wires models to repositories and adapters so you can build data access that is framework-agnostic yet fully typed.

> Release docs refreshed on 2025-11-26. See [workdocs/reports/RELEASE_NOTES.md](./workdocs/reports/RELEASE_NOTES.md) for ticket summaries.

### Core Concepts

*   **`Repository`**: A class that implements the repository pattern, providing a consistent API for CRUD operations and querying.
*   **`Adapter`**: An abstract class that defines the interface for connecting to different database backends.
*   **`Statement`**: A query builder for creating complex database queries in a fluent, type-safe manner.
*   **`TaskEngine`**: A system for managing background jobs and asynchronous operations.
*   **`ModelService` and `PersistenceService`**: Base classes for creating services that encapsulate business logic and data access.
*   **Migrations**: A system for managing database schema changes over time.
*   **RAM Adapter**: An in-memory adapter for testing and development.
