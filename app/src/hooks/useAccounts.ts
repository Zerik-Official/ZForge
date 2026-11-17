/**
 * useAccounts — saved game accounts with their characters.
 *
 * Loads the list once and reloads it when the backend reports new characters
 * (`accounts://changed`) or when the caller saves or deletes an account.
 */

import { useCallback, useEffect, useState } from "react";
import { accountsApi } from "@/services/api";
import { onAccountsChanged, subscribe } from "@/services/api/events";
import type { AccountSummary } from "@/types/domains/accounts";

export interface AccountsState {
  accounts: AccountSummary[] | null;
  error: unknown;
  reload: () => Promise<void>;
}

export function useAccounts(): AccountsState {
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setAccounts(await accountsApi.listAccounts());
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    accountsApi
      .listAccounts()
      .then((list) => {
        if (!cancelled) setAccounts(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e);
      });
    const unsubscribe = subscribe(onAccountsChanged(() => void reload()));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [reload]);

  return { accounts, error, reload };
}

/** Display name of an account: its label, or the login name. */
export function accountName(account: { label: string; username: string }): string {
  return account.label.trim() || account.username;
}

/** Realms known for an account: its default realm and those of its saved characters. */
export function accountRealms(account: AccountSummary): string[] {
  const realms = [account.default_realm, ...account.characters.map((character) => character.realm)];
  return [...new Set(realms.filter((realm) => realm.trim() !== ""))];
}
