"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { BankProvider } from "@/lib/bank-context";
import { FeaturesProvider } from "@/lib/features-context";

const ControlPlaneAuthContext = createContext(false);

export function useControlPlaneAuthEnabled() {
  return useContext(ControlPlaneAuthContext);
}

export function ControlPlaneProviders({
  children,
  authEnabled,
}: {
  children: ReactNode;
  authEnabled: boolean;
}) {
  const pathname = usePathname();

  // Login and API instructions work without the dataplane. Keep local auth
  // state available there, but mount business loaders only on business pages.
  const needsDataplane = pathname !== "/login" && pathname !== "/api-access";
  return (
    <ControlPlaneAuthContext.Provider value={authEnabled}>
      {needsDataplane ? (
        <FeaturesProvider authEnabled={authEnabled}>
          <BankProvider>{children}</BankProvider>
        </FeaturesProvider>
      ) : (
        children
      )}
    </ControlPlaneAuthContext.Provider>
  );
}
