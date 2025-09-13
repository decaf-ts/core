import {
  Context,
  InternalError,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { Adapter } from "./Adapter";
import { hashObj } from "@decaf-ts/decorator-validation";
import { final } from "../utils/index";

export abstract class RemoteAdapter<
  Y,
  CON,
  Q,
  F extends RepositoryFlags,
  C extends Context<F>,
> extends Adapter<Y, Q, F, C> {
  private _client?: CON;

  protected constructor(cfg: Y, flavour: string, alias?: string) {
    super(cfg, flavour, alias);
  }

  /**
   * @description Returns the client instance for the adapter
   * @summary This method should be overridden by subclasses to return the client instance for the adapter.
   * @template CON - The type of the client instance
   * @return {CON} The client instance for the adapter
   * @abstract
   * @function getClient
   * @memberOf module:core
   * @instance
   * @protected
   */
  protected abstract getClient(): CON;

  @final()
  protected async shutdownProxies(k?: string) {
    if (!this.proxies) return;
    if (k && !(k in this.proxies))
      throw new InternalError(`No proxy found for ${k}`);
    if (!k) {
      for (const key in this.proxies) {
        try {
          await this.proxies[key].shutdown();
        } catch (e: unknown) {
          this.log.error(`Failed to shutdown proxied adapter ${key}: ${e}`);
          continue;
        }
        delete this.proxies[key];
      }
    } else {
      try {
        await this.proxies[k].shutdown();
        delete this.proxies[k];
      } catch (e: unknown) {
        this.log.error(`Failed to shutdown proxied adapter ${k}: ${e}`);
      }
    }
  }

  abstract shutdown(): Promise<void>;

  @final()
  get client(): CON {
    if (!this._client) {
      this._client = this.getClient();
    }
    return this._client;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override for(config: Partial<Y>, ...args: any[]): typeof this {
    if (!this.proxies) this.proxies = {};
    const key = `${this.alias} - ${hashObj(config)}`;
    if (key in this.proxies) return this.proxies[key] as typeof this;

    let client: any;
    const proxy = new Proxy(this, {
      get: (target: typeof this, p: string | symbol, receiver: any) => {
        if (p === "_native") {
          const originalNative: Y = Reflect.get(target, p, receiver);
          return Object.assign({}, originalNative, config);
        }
        if (p === "_client") {
          return client;
        }
        return Reflect.get(target, p, receiver);
      },
      set: (target: any, p: string | symbol, value: any, receiver: any) => {
        if (p === "_client") {
          client = value;
          return true;
        }
        return Reflect.set(target, p, value, receiver);
      },
    });
    this.proxies[key] = proxy;
    return proxy;
  }
}
