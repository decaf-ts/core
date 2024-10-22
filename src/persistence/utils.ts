import {
  Constructor,
  Model,
  ModelConstructor,
  ModelRegistry,
} from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "./constants";
import { Adapter } from "./Adapter";
import { DBKeys, InternalError } from "@decaf-ts/db-decorators";
import { Repository } from "../repository/Repository";

export function getColumnName<T extends Model>(model: T, attribute: string) {}
