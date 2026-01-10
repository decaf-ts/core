/* eslint-disable @typescript-eslint/no-unused-vars */
import { InternalError } from "@decaf-ts/db-decorators";

import { TestCountryModel } from "./models";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";
import {
  DirectionLimitOffset,
  OrderDirection,
  Paginator,
  PreparedStatementKeys,
  QueryError,
  SerializedPage,
  query,
  prepared,
  Repository,
} from "../../src/index";

jest.setTimeout(500000);

class TestCountryModelRepo extends Repository<TestCountryModel, any> {
  constructor(adapter: any) {
    super(adapter, TestCountryModel);
  }

  @query()
  async findByIdBiggerOrderById(
    id: string,
    direction: OrderDirection,
    params: DirectionLimitOffset
  ) {
    throw new InternalError("Should be overridden by decorator");
  }

  // TODO @pedro make this happen automatically
  @prepared()
  async paginateByIdBiggerOrderById(
    id: string,
    params: DirectionLimitOffset = {},
    ...args: any[]
  ): Promise<SerializedPage<TestCountryModel>> {
    const { offset, bookmark, limit } = params;
    if (!offset && !bookmark)
      throw new QueryError(`PaginateBy needs a page or a bookmark`);
    const { ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE_BY, true)
    ).for(this.paginateByIdBiggerOrderById);

    const direction = params.direction || OrderDirection.DSC;
    const paginator: Paginator<TestCountryModel> = await this.override({
      forcePrepareSimpleQueries: false,
      forcePrepareComplexQueries: false,
    })
      .select()
      .where(this.attr("id").gt(id))
      .orderBy(["id", direction])
      .paginate(limit || 10, ...ctxArgs);

    const paged =
      bookmark !== undefined
        ? await paginator.page(1, ...ctxArgs)
        : await paginator.page(offset || 1, ...ctxArgs);

    return paginator.serialize(paged) as SerializedPage<TestCountryModel>;
  }
}

describe(`Pagination`, function () {
  let adapter: RamAdapter;
  let repo: RamRepository<TestCountryModel>;

  let created: TestCountryModel[];
  const size = 100;

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = new TestCountryModelRepo(adapter);
    const models = Object.keys(new Array(size).fill(0)).map(
      (i) =>
        new TestCountryModel({
          name: "country" + (parseInt(i) + 1),
          countryCode: "pt",
          locale: "pt_PT",
        })
    );

    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(created.length).toEqual(size);
  });

  let selected: TestCountryModel[];
  it.skip("Fails to sort in an unindexed property", async () => {
    await expect(
      repo.select().orderBy(["id", OrderDirection.ASC]).execute()
    ).rejects.toThrow(InternalError);
  });

  it("indexes de database properly according to defined indexes", async () => {
    await adapter.initialize();
  });

  it("Sorts via defined property when there is an index", async () => {
    selected = await repo
      .select()
      .orderBy(["id", OrderDirection.ASC])
      .execute();
    expect(selected).toBeDefined();
    expect(selected.length).toEqual(created.length);
    for (let i = 0; i < selected.length; i++) {
      expect(selected[i].equals(created[i])).toEqual(true);
    }
    expect(created.every((c, i) => c.equals(selected[i]))).toEqual(true);
  });

  it("paginates", async () => {
    const paginator: Paginator<TestCountryModel> = await repo
      .select()
      .orderBy(["id", OrderDirection.DSC])
      .paginate(10);

    expect(paginator).toBeDefined();

    expect(paginator.size).toEqual(10);
    expect(paginator.current).toEqual(undefined);

    const page1 = await paginator.page();
    expect(page1).toBeDefined();

    const ids = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91];

    expect(page1.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids)
    );

    expect(paginator.current).toEqual(1);

    const page2 = await paginator.next();
    expect(page2).toBeDefined();

    expect(page2.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 10))
    );

    const page3 = await paginator.next();
    expect(page3).toBeDefined();

    expect(page3.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 20))
    );

    const page4 = await paginator.next();
    expect(page4).toBeDefined();

    expect(page4.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 30))
    );
  });

  it("paginates with prepared statements", async () => {
    const paginator: Paginator<TestCountryModel> = await repo
      .override({
        forcePrepareSimpleQueries: true,
        forcePrepareComplexQueries: true,
      })
      .select()
      .orderBy(["id", OrderDirection.DSC])
      .paginate(10);

    expect(paginator).toBeDefined();

    expect(paginator.size).toEqual(10);
    expect(paginator.current).toEqual(undefined);
    const page1 = (await paginator.page()) as any;
    expect(page1).toBeDefined();
    expect(paginator.total).toEqual(10);
    expect(paginator.current).toEqual(1);

    expect(paginator.current).toEqual(1);
    const ids = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91];

    expect(page1.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids)
    );

    const page2 = (await paginator.next()) as any;
    expect(page2).toBeDefined();

    expect(paginator.current).toEqual(2);

    expect(page2.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 10))
    );

    const page3 = (await paginator.next()) as any;
    expect(page3).toBeDefined();

    expect(paginator.current).toEqual(3);
    expect(page3.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 20))
    );

    const page4 = (await paginator.next()) as any;
    expect(page4).toBeDefined();

    expect(paginator.current).toEqual(4);
    expect(page4.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 30))
    );
  });

  // TODO @pedro compatibilize pagination with complex queries. I though we said the sort direction would be a 'query param'?
  it.skip("handles complex queries", async () => {
    const paginator: Paginator<TestCountryModel> = await repo
      .override({
        forcePrepareSimpleQueries: true,
        forcePrepareComplexQueries: true,
      })
      .select()
      .where(repo.attr("id").gt(50))
      .orderBy(["id", OrderDirection.DSC])
      .paginate(10);

    expect(paginator).toBeDefined();

    expect(paginator.size).toEqual(10);
    expect(paginator.current).toEqual(undefined);

    const page1 = (await paginator.page()) as any;
    expect(page1).toBeDefined();
    expect(paginator.total).toEqual(5);
    expect(paginator.current).toEqual(1);

    const ids = [100, 99, 98, 97, 96, 95, 94, 93, 92, 91];

    expect(page1.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids)
    );

    const page2 = (await paginator.next()) as any;
    expect(page2).toBeDefined();

    expect(paginator.current).toEqual(2);
    expect(page2.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 10))
    );

    const page3 = (await paginator.next()) as any;
    expect(page3).toBeDefined();

    expect(paginator.current).toEqual(3);
    expect(page3.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 20))
    );

    const page4 = (await paginator.next()) as any;
    expect(page4).toBeDefined();

    expect(paginator.current).toEqual(4);
    expect(page4.map((el: any) => el["id"])).toEqual(
      expect.arrayContaining(ids.map((e) => e - 30))
    );
  });
});
