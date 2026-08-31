import { bridge } from "../bridge";

export class HealthApi {
  ping(): Promise<string> {
    return bridge().ping();
  }
}

export const healthApi = new HealthApi();