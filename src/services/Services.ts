import { InternalError } from "@decaf-ts/db-decorators";
import { final, Logging } from "@decaf-ts/logging";
import { Constructor } from "@decaf-ts/decoration";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { ContextualLoggedClass } from "../utils/ContextualLoggedClass";

export abstract class Service extends ContextualLoggedClass<any> {
  protected constructor(readonly name?: string) {
    super();
  }

  /**
   * @description Retrieves a Service instance by name/class
   * @summary Looks up and returns a cached API instance by its name or constructor
   * @template A Type extending Api
   * @param {string | Constructor<A>} name - Name of the API or its constructor
   * @return {A} The requested API instance
   */
  static get<A extends Service>(name: string | symbol | Constructor<A>): A {
    if (!name) throw new InternalError(`No name provided`);

    const injectable = Injectables.get(name);
    if (injectable) return injectable as A;

    throw new InternalError(
      `No Service found for ${typeof name === "string" ? name : typeof name === "symbol" ? name.toString() : name.name}`
    );
  }

  static async boot(): Promise<void> {
    const log = Logging.for(this.boot);
    const services = Injectables.services();
    for (const [key, service] of Object.entries(services)) {
      try {
        const s = new (
          service as unknown as { data: Constructor<Service> }
        ).data();
        if (s instanceof ClientBasedService) await s.boot();
      } catch (e: unknown) {
        log.error(`Failed to boot ${key} service`, e as Error);
      }
    }
  }
}

export abstract class ClientBasedService<CLIENT, CONF> extends Service {
  protected _client?: CLIENT;

  protected _config?: CONF;

  protected constructor() {
    super();
  }

  @final()
  async boot() {
    const { config, client } = await this.initialize();
    this._config = config;
    this._client = client;
  }

  abstract initialize(): Promise<{
    config: CONF;
    client: CLIENT;
  }>;

  @final()
  protected get config(): CONF {
    if (!this._config) throw new InternalError(`Config not initialized`);
    return this._config;
  }

  @final()
  get client(): CLIENT {
    if (!this._client) throw new InternalError(`Client not initialized`);
    return this._client;
  }

  async shutdown(): Promise<void> {
    // do nothing. sub classes must implement this if controlled shutdown is necessary
  }
}
