import { call } from "../bridge";
import type { Account, AccountDraft, AccountSummary, LaunchChoice } from "@/types/domains/accounts";

export class AccountsApi {
  listAccounts(): Promise<AccountSummary[]> {
    return call("list_accounts");
  }

  /** Create (`id` null) or update an account; an empty password keeps the stored one. */
  saveAccount(id: string | null, account: AccountDraft, password: string): Promise<Account> {
    return call("save_account", { id, account, password: password || null });
  }

  deleteAccount(id: string): Promise<void> {
    return call("delete_account", { id });
  }

  /** How a game was launched last time. */
  getLaunchChoice(gameId: string): Promise<LaunchChoice> {
    return call("get_launch_choice", { gameId });
  }
}

export const accountsApi = new AccountsApi();
