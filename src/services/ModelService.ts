import { Constructor } from "@decaf-ts/decoration";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Service } from "../utils/Services";
import { service } from "../utils/decorators";
import { Repository } from "../repository/Repository";
import { create, del, read, update } from "./decorators";

export abstract class ModelService<T extends Model> extends Service {
  protected repository!: Repository<T, any>;

  protected constructor(public readonly ModelConstr: ModelConstructor<T>) {
    super(ModelConstr.name);
    this.repository = Repository.forModel(ModelConstr);

    // [this.create, this.update, this.findAll, this.findOne, this.delete].forEach(
    //   (m) => {
    //     const name = m.name;
    //     wrapMethodWithContext(
    //       this,
    //       (this as any)[name + "Prefix"],
    //       m,
    //       (this as any)[name + "Suffix"]
    //     );
    //   }
    // );
  }

  static forModel<M extends Model, S extends ModelService<M>>(
    this: new (model: ModelConstructor<M>) => S,
    model: ModelConstructor<M>,
    alias?: string
  ): S {
    let instance: S | undefined;
    const _alias: string = alias || model.name + "Service";
    try {
      instance = ModelService.get(_alias) as S;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      instance = undefined;
    }

    if (instance instanceof ModelService) return instance as S;

    const Base = this as Constructor;
    @service(_alias)
    class DecoratedService extends Base {
      constructor() {
        super(model);
      }
    }
    return new DecoratedService() as S;
  }

  for(conf: any, ...args: any[]): this {
    const target = this as any;
    return new Proxy(target, {
      get(original, prop, receiver) {
        if (prop === "repository") {
          return (original.repository as any).for(conf, ...args);
        }
        return Reflect.get(original, prop, receiver);
      },
    }) as this;
  }

  @create()
  async create(data: T): Promise<T> {
    const entity = await this.repository.create(data as any);
    return entity as any;
  }

  @update()
  async update(id: string, data: T): Promise<T> {
    const existing = await this.repository.read(id as any);
    if (!existing) throw new Error("Record not found");
    const entity = await this.repository.update(data as any);
    return entity as any;
  }

  @read()
  async findAll(): Promise<T[]> {
    const entities = await this.repository.readAll([]);
    return entities as any;
  }

  @read()
  async findOne(id: string): Promise<T | null> {
    const entity = await this.repository.read(id as any);
    return entity as any;
  }

  @read()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async query(methodName: string, ..._args: any[]): Promise<T | null> {
    throw new Error("Not implemented");
  }

  @del()
  async delete(id: string): Promise<T> {
    const record = await this.repository.read(id as any);
    if (!record) throw new Error("Record not found");

    const entity = await this.repository.delete(id as any);
    return entity as any;
  }

  // ------------------------------------------------------------------
  protected async createPrefix(
    data: T,
    ...rest: any[]
  ): Promise<[T, ...any[]]> {
    return [data, ...rest];
  }

  protected async createSuffix(result: T): Promise<T> {
    return result;
  }

  protected async updatePrefix(
    id: string,
    data: T,
    ...rest: any[]
  ): Promise<[string, T, ...any[]]> {
    return [id, data, ...rest];
  }

  protected async updateSuffix(result: T): Promise<T> {
    return result;
  }

  protected async findAllPrefix(...rest: any[]): Promise<[...any[]]> {
    return [...rest];
  }

  protected async findAllSuffix(result: T[]): Promise<T[]> {
    return result;
  }

  protected async findOnePrefix(
    id: string,
    ...rest: any[]
  ): Promise<[string, ...any[]]> {
    return [id, ...rest];
  }

  protected async findOneSuffix(result: T | null): Promise<T | null> {
    return result;
  }

  protected async deletePrefix(
    id: string,
    ...rest: any[]
  ): Promise<[string, ...any[]]> {
    return [id, ...rest];
  }

  protected async deleteSuffix(result: T): Promise<T> {
    return result;
  }
}
