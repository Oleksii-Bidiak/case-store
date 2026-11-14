"use client";

import { useEffect } from "react";
import { syncMyDevicesFlags } from "@/entities/my-devices";
import { useMyDevicesSync } from "../model/use-my-devices-sync";

/**
 * Renderless: keeps «Мої пристрої» in sync with the account (TASK-1959).
 * Mounted once in app/providers, under the AuthProvider it reads.
 *
 * On its first mount it also realigns the <html> device flags with the
 * validated list: the pre-paint script trusts the raw JSON, and a stale or
 * corrupt entry would otherwise keep empty device-fit slots reserved.
 */
export function MyDevicesSync(): null {
  useEffect(() => {
    syncMyDevicesFlags();
  }, []);
  useMyDevicesSync();
  return null;
}
