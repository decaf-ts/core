import { Cascade, OrderDirection } from "./constants";

/**
 * @summary defines the cascading behaviour
 */
export type CascadeMetadata = {
  update: Cascade;
  delete: Cascade;
};

export type IndexMetadata = {
  directions?: OrderDirection[2];
  compositions?: string[];
};
