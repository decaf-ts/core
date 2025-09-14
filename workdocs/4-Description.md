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
