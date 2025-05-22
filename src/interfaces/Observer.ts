export interface Observer {
  refresh(...args: any[]): Promise<void>;
}
