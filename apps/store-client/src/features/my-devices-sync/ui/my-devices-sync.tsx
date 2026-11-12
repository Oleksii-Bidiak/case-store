"use client";

import { useMyDevicesSync } from "../model/use-my-devices-sync";

/**
 * Renderless: keeps «Мої пристрої» in sync with the account (TASK-1959).
 * Mounted once in app/providers, under the AuthProvider it reads.
 */
export function MyDevicesSync(): null {
  useMyDevicesSync();
  return null;
}
