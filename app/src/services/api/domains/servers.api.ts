import { call } from "../bridge";
import type { CustomServerInput, ServerEntry } from "@/types/domains/server";

export class ServersApi {
  listServers(): Promise<ServerEntry[]> {
    return call("list_servers");
  }

  saveCustomServer(server: CustomServerInput): Promise<void> {
    return call("save_custom_server", { server });
  }

  addCustomRealm(realmlist: string, realm: string): Promise<void> {
    return call("add_custom_realm", { realmlist, realm });
  }
}

export const serversApi = new ServersApi();
