import { bridge } from "../bridge";
import type { ApiResult, ServerEntry } from "@/types/pywebview";

export class ServersApi {
  listServers(): Promise<ServerEntry[]> {
    return bridge().list_servers();
  }

  saveCustomServer(payload: { realmlist: string; name?: string; realm?: string }): Promise<ApiResult> {
    return bridge().save_custom_server(payload);
  }

  addCustomRealm(realmlist: string, realm: string): Promise<ApiResult> {
    return bridge().add_custom_realm(realmlist, realm);
  }
}

export const serversApi = new ServersApi();