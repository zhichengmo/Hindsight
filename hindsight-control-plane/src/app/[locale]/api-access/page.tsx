"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff } from "lucide-react";
import { ControlPlaneHeader } from "@/components/control-plane-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiAccessMetadata } from "@/lib/api-access";
import { apiAccessExamples } from "@/lib/api-access-examples";
import { withBasePath } from "@/lib/base-path";

function CodeBlock({ text }: { text: string }) {
  const t = useTranslations("apiAccess");
  const [status, setStatus] = useState("");
  const code = useRef<HTMLElement>(null);
  return (
    <div className="space-y-2">
      <pre className="rounded-lg border border-border bg-muted p-4 text-xs sm:text-sm whitespace-pre-wrap break-all">
        <code ref={code}>{text}</code>
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setStatus(t("copied"));
            } catch {
              // HTTP origins may not expose Clipboard API. Select the snippet so
              // the user can copy manually, and report failure accurately.
              if (code.current) {
                const range = document.createRange();
                range.selectNodeContents(code.current);
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
              }
              setStatus(t("copyFailed"));
            }
          }}
        >
          <Copy className="h-4 w-4" />
          {t("copy")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {status}
        </span>
      </div>
    </div>
  );
}

export default function ApiAccessPage() {
  const t = useTranslations("apiAccess");
  const [metadata, setMetadata] = useState<ApiAccessMetadata | null>(null);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState("");
  const keyInput = useRef<HTMLInputElement>(null);
  const keyRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(withBasePath("/api/api-access"), { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = withBasePath("/login?returnTo=%2Fapi-access");
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t("loadFailed"));
        setMetadata(data);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : t("loadFailed"));
      });
    const clearKey = () => {
      // A late response must not reveal the key again after the tab was hidden.
      keyRequest.current?.abort();
      setApiKey("");
      setKeyBusy(false);
      setKeyMessage("");
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearKey();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", clearKey);
    return () => {
      controller.abort();
      keyRequest.current?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", clearKey);
    };
  }, [t]);

  async function accessKey(copy: boolean) {
    if (keyBusy) return;
    if (!copy && apiKey) {
      setApiKey("");
      setKeyMessage("");
      return;
    }
    setKeyBusy(true);
    setKeyMessage("");
    const controller = new AbortController();
    keyRequest.current = controller;
    try {
      const response = await fetch(withBasePath("/api/api-access/key"), {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) {
        setApiKey("");
        window.location.href = withBasePath("/login?returnTo=%2Fapi-access");
        return;
      }
      const data = await response.json();
      if (!response.ok || typeof data.apiKey !== "string")
        throw new Error(data.error || t("loadFailed"));
      if (controller.signal.aborted || document.hidden) return;
      if (copy) {
        try {
          await navigator.clipboard.writeText(data.apiKey);
          if (!controller.signal.aborted) setKeyMessage(t("copied"));
        } catch {
          if (controller.signal.aborted || document.hidden) return;
          setApiKey(data.apiKey);
          setKeyMessage(t("copyFailed"));
          requestAnimationFrame(() => keyInput.current?.select());
        }
      } else setApiKey(data.apiKey);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setApiKey("");
        setKeyMessage(failure instanceof Error ? failure.message : t("loadFailed"));
      }
    } finally {
      if (!controller.signal.aborted) setKeyBusy(false);
    }
  }

  const baseUrl = metadata?.apiBaseUrl || "<YOUR_API_BASE_URL>";
  const fields = [
    "bank_id",
    "operation_id",
    "status",
    "document_id",
    "metadata",
    "results",
    "items/total",
    "updates / config / overrides",
    "query / types / budget / max_tokens",
    "results[].id / text / type",
    "async / success / items_count",
    "items[].content / context / timestamp",
    "update_mode",
    "operation_type",
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <ControlPlaneHeader />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <a
          href={withBasePath("/dashboard")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </a>
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {!metadata && !error && <p role="status">{t("loading")}</p>}
        {metadata && (
          <>
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">{t("connection")}</h2>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="api-base-url">{t("apiBaseUrl")}</Label>
                  <Input
                    id="api-base-url"
                    readOnly
                    value={metadata.apiBaseUrl || ""}
                    placeholder={t("notConfigured")}
                    className="font-mono"
                  />
                  {!metadata.apiBaseUrl && (
                    <p className="text-sm text-muted-foreground">
                      {t(metadata.apiUrlStatus === "invalid" ? "invalidUrl" : "missingUrl")}
                    </p>
                  )}
                  {metadata.docsUrl && (
                    <a
                      href={metadata.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      {t("swagger")}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dataplane-key">API Key</Label>
                  <Input
                    ref={keyInput}
                    id="dataplane-key"
                    readOnly
                    autoComplete="off"
                    spellCheck={false}
                    value={
                      apiKey ||
                      (metadata.apiKeyConfigured ? "••••••••••••••••••••••••••••••••" : "")
                    }
                    placeholder={t("notConfigured")}
                    className="font-mono"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={keyBusy || !metadata.apiKeyConfigured}
                      onClick={() => accessKey(false)}
                    >
                      {apiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {t(apiKey ? "hide" : "show")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={keyBusy || !metadata.apiKeyConfigured}
                      onClick={() => accessKey(true)}
                    >
                      <Copy className="h-4 w-4" />
                      {t("copyKey")}
                    </Button>
                  </div>
                  <p role="status" className="text-sm text-muted-foreground">
                    {keyMessage}
                  </p>
                  {!metadata.apiKeyConfigured && (
                    <p className="text-sm text-muted-foreground">{t("missingKey")}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{t("keyHelp")}</p>
                </div>
                <CodeBlock text="Authorization: Bearer <YOUR_API_KEY>" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">{t("msPet")}</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("msPetHelp")}</p>
                <CodeBlock
                  text={`HINDSIGHT_BASE_URL=${baseUrl}\nHINDSIGHT_API_KEY=<YOUR_API_KEY>`}
                />
              </CardContent>
            </Card>
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">{t("examplesTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("exampleHelp")}</p>
              <p className="text-sm text-muted-foreground">{t("asyncHelp")}</p>
              {apiAccessExamples(baseUrl).map((example) => (
                <details
                  key={example.id}
                  className="rounded-xl border border-border bg-card p-4 sm:p-5"
                  open={example.id === "bank"}
                >
                  <summary className="cursor-pointer font-medium">
                    {t(`examples.${example.id}`)}
                    <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                      {example.method} {example.path}
                    </span>
                  </summary>
                  <div className="mt-5 space-y-4">
                    <h3 className="text-sm font-medium">{t("request")}</h3>
                    <CodeBlock text={example.request} />
                    <h3 className="text-sm font-medium">{t("response")}</h3>
                    <CodeBlock text={JSON.stringify(example.response, null, 2)} />
                  </div>
                </details>
              ))}
            </section>
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">{t("fieldsTitle")}</h2>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-3">{t("field")}</th>
                      <th className="p-3">{t("meaning")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field} className="border-t border-border">
                        <td className="p-3 font-mono align-top">{field}</td>
                        <td className="p-3">{t(`fields.f${index}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground">{t("deletionHelp")}</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
