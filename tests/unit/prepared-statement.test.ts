import { minlength, model, required, Model } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { defaultQueryAttr, SerializedPage } from "../../src/query";
import {
  BaseModel,
  Paginator,
  pk,
  Repository,
  OrderDirection,
  QueryError,
} from "../../src/index";
import type { RamRepository } from "../../src/ram/types";
import { uses } from "@decaf-ts/decoration";

jest.setTimeout(50000);

describe("prepared statements", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
  });

  @uses("ram")
  @model()
  class TestBulkModel extends BaseModel {
    @pk({ type: Number })
    id?: number = undefined;

    @required()
    @minlength(5)
    attr1?: string = undefined;

    constructor(arg?: ModelArg<TestBulkModel>) {
      super(arg);
    }
  }

  let created: TestBulkModel[];

  it("Creates in bulk", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);
    const models = [1].map(
      (i) =>
        new TestBulkModel({
          attr1: "user_name_" + i,
        })
    );
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(created.every((el) => !el.hasErrors())).toEqual(true);
  });

  it("executes default prepared statements", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);

    const res1 = await repo.listBy("attr1", OrderDirection.DSC);

    const res2 = await repo.statement("listBy", "attr1", "desc");

    expect(res1).toEqual(res2);

    const res11 = await repo.paginateBy("attr1", OrderDirection.DSC, {
      offset: 1,
      limit: 5,
    });

    const res22 = await repo.statement("paginateBy", "attr1", "desc", {
      limit: 5,
      offset: 1,
    });

    expect(JSON.parse(JSON.stringify(res11))).toEqual(
      JSON.parse(JSON.stringify(res22))
    );

    const page1 = res11.data;
    const page11 = res22.data;

    expect(page1).toEqual(page11);
  });

  it("fails for unprepared statements", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const res1 = await repo.select().execute();

    await expect(repo.statement("select")).rejects.toThrow(QueryError);
  });

  it("prepares in the statement itself", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);

    const prepared = await repo.select().prepare();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = await prepared.execute();

    await expect(repo.statement("select")).rejects.toThrow(QueryError);
  });

  @uses("ram")
  @model()
  class DefaultQueryModel extends BaseModel {
    @pk({ type: Number })
    id?: number = undefined;

    @required()
    @defaultQueryAttr()
    attr1?: string = undefined;

    @required()
    @defaultQueryAttr()
    attr2?: string = undefined;

    constructor(arg?: ModelArg<DefaultQueryModel>) {
      super(arg);
    }
  }

  describe("default query statements", () => {
    let searchRepo: RamRepository<DefaultQueryModel>;

    beforeAll(async () => {
      searchRepo = Repository.forModel<
        DefaultQueryModel,
        RamRepository<DefaultQueryModel>
      >(DefaultQueryModel);
      const models = [
        new DefaultQueryModel({ attr1: "apple", attr2: "zebra" }),
        new DefaultQueryModel({ attr1: "apricot", attr2: "amber" }),
        new DefaultQueryModel({ attr1: "banana", attr2: "aurora" }),
        new DefaultQueryModel({ attr1: "delta", attr2: "aardvark" }),
        new DefaultQueryModel({ attr1: "omega", attr2: "alpha" }),
        new DefaultQueryModel({ attr1: "sigma", attr2: "altitude" }),
      ];
      await searchRepo.createAll(models);
    });

    it("finds records using default query attributes", async () => {
      const matches = await searchRepo.find("ap", OrderDirection.ASC);
      expect(matches.map((record) => record.attr1)).toEqual([
        "apple",
        "apricot",
      ]);
      expect(
        matches.every(
          (record) =>
            record.attr1?.startsWith("ap") || record.attr2?.startsWith("ap")
        )
      ).toEqual(true);

      const stmtMatches = (await searchRepo.statement(
        "find",
        "ap",
        "asc"
      )) as DefaultQueryModel[];
      expect(stmtMatches.map((record) => record.attr1)).toEqual(
        matches.map((record) => record.attr1)
      );
    });

    it("paginates records using default query attributes", async () => {
      const pageResult = await searchRepo.page("a", OrderDirection.DSC, {
        offset: 1,
        limit: 2,
      });
      expect(pageResult.data.length).toEqual(2);
      expect(
        pageResult.data.every(
          (record) =>
            record.attr1?.startsWith("a") || record.attr2?.startsWith("a")
        )
      ).toEqual(true);

      const stmtPage = (await searchRepo.statement("page", "a", "desc", {
        offset: 1,
        limit: 2,
      })) as SerializedPage<DefaultQueryModel>;

      expect(stmtPage.data.map((record) => record.attr1)).toEqual(
        pageResult.data.map((record) => record.attr1)
      );
    });

    it("includes matches from secondary default query attributes and keeps ordering consistent", async () => {
      const ascMatches = await searchRepo.find("al", OrderDirection.ASC);
      const descMatches = await searchRepo.find("al", OrderDirection.DSC);

      expect(
        ascMatches.every((record) => record.attr2?.startsWith("al"))
      ).toEqual(true);
      expect(
        descMatches.every((record) => record.attr2?.startsWith("al"))
      ).toEqual(true);

      expect(ascMatches.map((record) => record.attr1)).toEqual([
        "omega",
        "sigma",
      ]);
      expect(descMatches.map((record) => record.attr1)).toEqual([
        "sigma",
        "omega",
      ]);

      const ascPage = await searchRepo.page("al", OrderDirection.ASC, {
        offset: 1,
        limit: 1,
      });
      expect(ascPage.data.map((record) => record.attr1)).toEqual(["omega"]);

      const descPage = await searchRepo.page("al", OrderDirection.DSC, {
        offset: 1,
        limit: 1,
      });
      expect(descPage.data.map((record) => record.attr1)).toEqual(["sigma"]);
    });

    it("prepares default find when raw statements are disabled", async () => {
      const preparedRepo = searchRepo.override({
        allowRawStatements: false,
        forcePrepareSimpleQueries: true,
        forcePrepareComplexQueries: false,
      });

      const matches = await preparedRepo.find("ap", OrderDirection.ASC);
      expect(matches.map((record) => record.attr1)).toEqual([
        "apple",
        "apricot",
      ]);
      expect(
        matches.every(
          (record) =>
            record.attr1?.startsWith("ap") || record.attr2?.startsWith("ap")
        )
      ).toEqual(true);
    });

    it("prepares default paging when raw statements are disabled", async () => {
      const preparedRepo = searchRepo.override({
        allowRawStatements: false,
        forcePrepareSimpleQueries: true,
        forcePrepareComplexQueries: false,
      });

      const pageResult = await preparedRepo.page("a", OrderDirection.ASC, {
        offset: 1,
        limit: 2,
      });

      expect(pageResult.data.length).toEqual(2);
      expect(
        pageResult.data.every(
          (record) =>
            record.attr1?.startsWith("a") || record.attr2?.startsWith("a")
        )
      ).toEqual(true);
    });
  });
});

@uses("ram")
@model()
class NumericQueryModel extends BaseModel {
  @pk({ type: Number })
  id?: number = undefined;

  @required()
  @defaultQueryAttr()
  searchName?: string = undefined;

  @required()
  @defaultQueryAttr()
  searchCode?: string = undefined;

  constructor(arg?: ModelArg<NumericQueryModel>) {
    super(arg);
  }
}

describe("default query statements with numeric strings", () => {
  const queryValue = "1";
  const expectedAscNames = [
    "10Start",
    "1Alpha",
    "1Beta",
    "1Zeta",
    "a1-Gamma",
    "foo10",
  ];
  const expectedDescNames = [...expectedAscNames].reverse();

  let numericRepo: RamRepository<NumericQueryModel>;
  let numericRepoDirect: RamRepository<NumericQueryModel>;

  beforeAll(async () => {
    numericRepo = Repository.forModel<
      NumericQueryModel,
      RamRepository<NumericQueryModel>
    >(NumericQueryModel);
    const models = [
      new NumericQueryModel({ searchName: "10Start", searchCode: "10-Start" }),
      new NumericQueryModel({ searchName: "1Alpha", searchCode: "1-Alpha" }),
      new NumericQueryModel({ searchName: "1Beta", searchCode: "1-Beta" }),
      new NumericQueryModel({ searchName: "1Zeta", searchCode: "1-Zeta" }),
      new NumericQueryModel({ searchName: "a1-Gamma", searchCode: "1-Gamma" }),
      new NumericQueryModel({ searchName: "foo10", searchCode: "10-Foo" }),
      new NumericQueryModel({ searchName: "alpha10", searchCode: "alpha-10" }),
      new NumericQueryModel({ searchName: "2Delta", searchCode: "2-Delta" }),
    ];
    await numericRepo.createAll(models);
    numericRepoDirect = numericRepo.override({
      forcePrepareComplexQueries: false,
      forcePrepareSimpleQueries: false,
    } as any);
  });

  it("finds numeric-prefixed strings via decorated attributes and maintains consistent ordering", async () => {
    const directRepo = numericRepoDirect;
    const ascMatches = await directRepo.find(queryValue, OrderDirection.ASC);
    const descMatches = await directRepo.find(queryValue, OrderDirection.DSC);

    expect(ascMatches.map((record) => record.searchName)).toEqual(
      expectedAscNames
    );
    expect(descMatches.map((record) => record.searchName)).toEqual(
      expectedDescNames
    );
    expect(
      ascMatches.every(
        (record) =>
          record.searchName?.startsWith(queryValue) ||
          record.searchCode?.startsWith(queryValue)
      )
    ).toEqual(true);
    expect(
      descMatches.every(
        (record) =>
          record.searchName?.startsWith(queryValue) ||
          record.searchCode?.startsWith(queryValue)
      )
    ).toEqual(true);
    expect(
      ascMatches.some((match) => match.searchName === "a1-Gamma")
    ).toEqual(true);
    expect(
      ascMatches.some((match) => match.searchName === "foo10")
    ).toEqual(true);
    expect(
      ascMatches.some((match) => match.searchName === "alpha10")
    ).toEqual(false);
  });

  it("pages numeric-prefixed data using sequential next/previous navigation", async () => {
    const pageLimit = 2;
    const expectedAscPages = [
      ["10Start", "1Alpha"],
      ["1Beta", "1Zeta"],
      ["a1-Gamma", "foo10"],
    ];

    const attrs = Model.defaultQueryAttributes(
      NumericQueryModel
    ) as (keyof NumericQueryModel)[];
    const condition = (numericRepoDirect as any).buildDefaultStartsWithCondition(
      queryValue,
      attrs
    );

    const repoPage1 = await numericRepoDirect.page(
      queryValue,
      OrderDirection.ASC,
      {
        offset: 1,
        limit: pageLimit,
      }
    );
    const repoPage2 = await numericRepoDirect.page(
      queryValue,
      OrderDirection.ASC,
      {
        offset: 2,
        limit: pageLimit,
      }
    );
    const repoPage3 = await numericRepoDirect.page(
      queryValue,
      OrderDirection.ASC,
      {
        offset: 3,
        limit: pageLimit,
      }
    );

    const repoAscNames = [
      repoPage1.data.map((record) => record.searchName),
      repoPage2.data.map((record) => record.searchName),
      repoPage3.data.map((record) => record.searchName),
    ];

    expect(repoAscNames).toEqual(expectedAscPages);

    const sequentialPaginator: Paginator<NumericQueryModel> = await numericRepoDirect
      .override({
        forcePrepareComplexQueries: false,
        forcePrepareSimpleQueries: false,
      } as any)
      .select()
      .where(condition)
      .orderBy([attrs[0], OrderDirection.ASC])
      .paginate(pageLimit);

    const paginatorPage1 = await sequentialPaginator.page();
    expect(paginatorPage1.map((record) => record.searchName)).toEqual(
      expectedAscPages[0]
    );
    expect(sequentialPaginator.current).toEqual(1);

    const paginatorPage2 = await sequentialPaginator.next();
    expect(paginatorPage2.map((record) => record.searchName)).toEqual(
      expectedAscPages[1]
    );
    expect(sequentialPaginator.current).toEqual(2);

    const paginatorPage3 = await sequentialPaginator.next();
    expect(paginatorPage3.map((record) => record.searchName)).toEqual(
      expectedAscPages[2]
    );
    expect(sequentialPaginator.current).toEqual(3);

    const backToPage2 = await sequentialPaginator.previous();
    expect(backToPage2.map((record) => record.searchName)).toEqual(
      expectedAscPages[1]
    );
    expect(sequentialPaginator.current).toEqual(2);

    const backToPage1 = await sequentialPaginator.previous();
    expect(backToPage1.map((record) => record.searchName)).toEqual(
      expectedAscPages[0]
    );
    expect(sequentialPaginator.current).toEqual(1);

    expect(repoPage1.data).toEqual(paginatorPage1);
    expect(repoPage2.data).toEqual(paginatorPage2);
    expect(repoPage3.data).toEqual(paginatorPage3);
  });

  it("pages numeric defaults in both directions with consistent metadata", async () => {
    const pageLimit = 2;
    const ascPage = await numericRepo.page(queryValue, OrderDirection.ASC, {
      offset: 1,
      limit: pageLimit,
    });

    expect(ascPage.current).toEqual(1);
    expect(ascPage.count).toEqual(expectedAscNames.length);
    expect(ascPage.total).toEqual(Math.ceil(expectedAscNames.length / pageLimit));
    expect(ascPage.data.map((record) => record.searchName)).toEqual(
      expectedAscNames.slice(0, pageLimit)
    );

    const ascPageTwo = await numericRepo.page(queryValue, OrderDirection.ASC, {
      offset: 2,
      limit: pageLimit,
    });
    expect(ascPageTwo.data.map((record) => record.searchName)).toEqual(
      expectedAscNames.slice(pageLimit, pageLimit * 2)
    );

    const descPage = await numericRepo.page(queryValue, OrderDirection.DSC, {
      offset: 1,
      limit: pageLimit,
    });
    expect(descPage.current).toEqual(1);
    expect(descPage.count).toEqual(expectedAscNames.length);
    expect(descPage.total).toEqual(Math.ceil(expectedAscNames.length / pageLimit));
    expect(descPage.data.map((record) => record.searchName)).toEqual(
      expectedDescNames.slice(0, pageLimit)
    );
  });
});
