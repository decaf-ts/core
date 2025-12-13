import { Decoration } from "@decaf-ts/decoration";
import { DBKeys } from "@decaf-ts/db-decorators";
import { generated } from "../model/index";

Decoration.for(DBKeys.TIMESTAMP).extend(generated()).apply();

Decoration.for(DBKeys.COMPOSED).extend(generated()).apply();
