// Shared contract every plug driver implements.
//
// Each driver maps a specific device family's HTTP/WS API onto these two
// operations. The registry talks only to this interface, so adding a new
// device family never touches the registry.

/** Minimal contract for any plug driver to implement. */
export interface Driver {
  fetchStatus(): Promise<{ on: boolean; activeWatts: number }>;
  setOutput(on: boolean): Promise<void>;
}
