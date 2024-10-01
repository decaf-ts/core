import { RawExecutor } from "./RawExecutor";
import { Observable } from "./Observable";
import { CrudOperator } from "@decaf-ts/db-decorators";

export interface IAdapter<T>
  extends CrudOperator<any>,
    RawExecutor<T>,
    Observable {}
