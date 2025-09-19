import { RamAdapter } from "../../src/ram/RamAdapter";
import { maxlength, min, minlength, model, ModelArg, required, } from "@decaf-ts/decorator-validation";
import { BaseModel, column, pk, query, Repository, repository, table, } from "../../src";

const ramAdapter = new RamAdapter();

@table("users")
@model()
export class TestUserModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  @required()
  name!: string;

  @column("nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  @column("age")
  @min(20)
  @required()
  age!: number;

  @column("country")
  // @unique()
  @minlength(2)
  @maxlength(2)
  @required()
  country!: string;

  @column("state")
  // @unique()
  @minlength(2)
  @maxlength(2)
  @required()
  state!: string;

  @column("active")
  @required()
  active!: boolean;

  constructor(arg?: ModelArg<TestUserModel>) {
    super(arg);
  }
}

export interface QueryRepository {
  findByName(name: string): TestUserModel | TestUserModel[];
}

@repository(TestUserModel)
export class MethodQueryBuilderRepo implements  QueryRepository extends Repository<
  TestUserModel,
  any,
  any,
  any,
  any
> {
  constructor(adapter?: any) {
    super(ramAdapter, TestUserModel);
  }

  init() {
    this.select().orderBy(["name", "asc"]).limit(10).offset(10)

    const data = [
      "John Smith",
      "Emily Johnson",
      "Michael Brown",
      "Sarah Davis",
      "David Wilson",
      "Emma Miller",
      "Daniel Taylor",
      "Olivia Anderson",
      "David Smith",
    ].map((name, idx) => {
      return new TestUserModel({
        id: (idx + 1).toString(),
        name,
        country: name.slice(-2).toUpperCase(),
        state: name.slice(0, 2).toUpperCase(),
        nif: Math.random().toString().slice(2, 11),
        age: 20 + idx * 2,
        active: idx % 3 === 0,
      });
    });
    return Repository.forModel(TestUserModel).createAll(data);
  }

  @query()
  findByName(name: string): any {}

  // @query()
  // findByName: (name: string) => TestUserModel | TestUserModel[]

  @query()
  findByAgeGreaterThanAndAgeLessThan(age1: number, age2: number) {}

  @query()
  findByAgeGreaterThanEqualAndAgeLessThanEqual(age1: number, age2: number) {}

  @query()
  async findByActive(): Promise<any[]> {}

  @query()
  findByActiveTrue() {}

  @query()
  findByActiveFalse() {}

  @query()
  findByCountryIn(countries: string[]) {}

  @query()
  findByNameEqualsOrAgeGreaterThan(name: string, age: number) {}
}

// defineQueries(TestUserModelRepo, [
//   "findByName",
//   "findByNameAndAgeGreaterThan",
//   "findByAgeGreaterThanAndActiveGroupByAgeThenByStateOrderByAgeDescThenByCountryDsc",
// ]);
