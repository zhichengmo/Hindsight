"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { LogOut, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useControlPlaneAuthEnabled } from "@/components/control-plane-providers";
import { useTheme } from "@/lib/theme-context";
import { withBasePath } from "@/lib/base-path";

export function ControlPlaneActions({ authEnabled }: { authEnabled: boolean }) {
  const t = useTranslations("nav");
  const { theme, toggleTheme } = useTheme();
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="h-9 w-9"
        title={t(theme === "light" ? "darkMode" : "lightMode")}
        aria-label={t(theme === "light" ? "darkMode" : "lightMode")}
      >
        {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </Button>
      <LanguageSwitcher />
      {authEnabled && (
        <>
          <div className="h-8 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            title={t("logout")}
            aria-label={t("logout")}
            onClick={async () => {
              try {
                const response = await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
                if (!response.ok) throw new Error("Logout failed");
                window.location.href = withBasePath("/login");
              } catch {
                toast.error(t("logoutFailed"));
              }
            }}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </>
      )}
    </>
  );
}

// API access must not mount the bank selector: its tree/version loaders need
// the dataplane even though obtaining the service key only needs local login.
export function ControlPlaneHeader() {
  const authEnabled = useControlPlaneAuthEnabled();
  const t = useTranslations("apiAccess");
  return (
    <header className="bg-card text-card-foreground px-5 py-3 border-b-4 border-primary-gradient">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <a href={withBasePath("/dashboard")} aria-label={t("back")}>
          <Image
            src={withBasePath("/logo.png")}
            alt="Hindsight"
            width={160}
            height={40}
            className="h-10 w-auto"
            unoptimized
          />
        </a>
        <div className="flex-1" />
        <ControlPlaneActions authEnabled={authEnabled} />
      </div>
    </header>
  );
}
