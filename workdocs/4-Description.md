### Description

More opinionated (but very convenient) extension of `db-decorators`, and exposes all the functionality from the previous modules in a very extensible and developer friendly way:
- wraps any storage (blockchain, relational/non-relational databases and any other storage mechanism);
- automates the boiled plate code from `decorator-validation`, `db-decorators` and `injectable-decorators`;
- provides raw access to the storage;
- provides querying capabilities;
- Provides Repository apis for all selector Models;
- Initializes the storage according to the selected Models;