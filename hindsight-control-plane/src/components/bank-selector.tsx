"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useBank } from "@/lib/bank-context";
import { bankRoute } from "@/lib/bank-url";
import { hoistCurrentBank } from "@/lib/bank-order";
import { withBasePath } from "@/lib/base-path";
import { client } from "@/lib/api";
import type { RetainContentBlock as ContentBlock } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** One element of a document composed as an ordered block list. */
type DocBlock =
  | { kind: "text"; text: string }
  | { kind: "attachment"; name: string; mediaType: string; data: string; size: number };

import { ControlPlaneActions } from "@/components/control-plane-header";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Check,
  ChevronsUpDown,
  Plus,
  FileText,
  Moon,
  Github,
  Upload,
  X,
  Lock,
  ChevronDown,
  ChevronRight,
  Copy,
  Paperclip,
  ChevronUp,
  SlidersHorizontal,
  Layers,
  FolderTree,
  Tag,
  Code2,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useFeatures } from "@/lib/features-context";
import Image from "next/image";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BANKS_PAGE_SIZE, type BankInfo } from "@/lib/bank-context";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toString();
}

// Pads date-only Event Date input ("YYYY-MM-DD") with midnight so the API never sees an ambiguous value.
function toIsoTimestamp(value: string): string {
  return value.includes("T") ? value : `${value}T00:00:00`;
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function buildPetDisplayName(name: string, breed: string, subjectId: string): string {
  const descriptor = [breed.trim(), subjectId.trim() ? `${subjectId.trim()}号` : ""]
    .filter(Boolean)
    .join("");
  return descriptor ? `${name.trim()} (${descriptor})` : name.trim();
}

function buildPetBankId(environment: string, subjectId: string): string {
  const normalizedId = subjectId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^pet-/, "");
  return normalizedId ? `${environment}-pet-${normalizedId}` : "";
}

function BankSelectorInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tNav = useTranslations("nav");
  const tNavBank = useTranslations("nav.bank");
  const tCommon = useTranslations("common");
  const tAddDocument = useTranslations("addDocument");
  const tApiError = useTranslations("api.errors.files");
  const {
    currentBank,
    setCurrentBank,
    bankInfos,
    banksLoading,
    banksLoadingMore,
    hasMoreBanks,
    bankSearch,
    currentBankName,
    searchBanks,
    loadBanks,
    loadMoreBanks,
  } = useBank();
  const { features, authEnabled } = useFeatures();
  const [open, setOpen] = React.useState(false);
  // One-shot spin of the header logo, fired by sidebar navigation (see the
  // "hindsight:logo-spin" listener below). Reset on animationEnd so it can replay.
  const [logoSpinning, setLogoSpinning] = React.useState(false);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [newBankId, setNewBankId] = React.useState("");
  const [newBankName, setNewBankName] = React.useState("");
  const [newBankSpaceCode, setNewBankSpaceCode] = React.useState("pet_health");
  const [newBankEnv, setNewBankEnv] = React.useState("test");
  const [newBankSubjectId, setNewBankSubjectId] = React.useState("");
  const [newPetSpecies, setNewPetSpecies] = React.useState("cat");
  const [newPetBreed, setNewPetBreed] = React.useState("");
  const [spaceDialogOpen, setSpaceDialogOpen] = React.useState(false);
  const [newSpaceCode, setNewSpaceCode] = React.useState("");
  const [newSpaceName, setNewSpaceName] = React.useState("");
  const [newSpaceDescription, setNewSpaceDescription] = React.useState("");
  const [isCreatingSpace, setIsCreatingSpace] = React.useState(false);
  const [spaceError, setSpaceError] = React.useState<string | null>(null);

  // Classification & Category Tree States
  const [viewMode, setViewMode] = React.useState<"classified" | "flat">("classified");
  const [categoryTree, setCategoryTree] = React.useState<any>(null);
  const [activeSpaceCode, setActiveSpaceCode] = React.useState<string>("all");
  const [collapsedEnvs, setCollapsedEnvs] = React.useState<Record<string, boolean>>({});

  // Classification Edit Dialog State
  const [editClassDialogOpen, setEditClassDialogOpen] = React.useState(false);
  const [editingClassification, setEditingClassification] = React.useState<{
    bank_id: string;
    space_code: string;
    environment: string;
    subject_type: string;
    subject_id: string;
    display_name: string;
    tags: string;
  }>({
    bank_id: "",
    space_code: "pet_health",
    environment: "test",
    subject_type: "pet_profile",
    subject_id: "",
    display_name: "",
    tags: "",
  });
  const [isSavingClassification, setIsSavingClassification] = React.useState(false);
  const [editingPetName, setEditingPetName] = React.useState("");
  const [editingPetSpecies, setEditingPetSpecies] = React.useState("cat");
  const [editingPetBreed, setEditingPetBreed] = React.useState("");

  // Load category tree on mount and when dialog closes or bank changes
  const loadCategoryTree = React.useCallback(async () => {
    try {
      const res = await client.getBankCategoryTree();
      if (res && res.data) {
        setCategoryTree(res.data);
      }
    } catch (e) {
      console.warn("Failed to load category tree:", e);
    }
  }, []);

  React.useEffect(() => {
    loadCategoryTree();
  }, [loadCategoryTree]);

  React.useEffect(() => {
    if (newBankSpaceCode === "pet_health") {
      setNewBankId(buildPetBankId(newBankEnv, newBankSubjectId));
    } else {
      setNewBankId("");
    }
  }, [newBankEnv, newBankSpaceCode, newBankSubjectId]);
  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [useTemplate, setUseTemplate] = React.useState(false);
  const [templateJson, setTemplateJson] = React.useState("");
  const [templateError, setTemplateError] = React.useState<string | null>(null);

  // Document creation state
  const [docDialogOpen, setDocDialogOpen] = React.useState(false);
  const [docTab, setDocTab] = React.useState<"text" | "upload">("text");
  const [docContent, setDocContent] = React.useState("");
  // Attachments to interleave into the document's content. Kept in order, and
  // appended after the prose: the API takes an ordered block list, and a form
  // with one textarea has no way to express "this picture goes *here*". Anyone
  // needing exact placement sends blocks through the API directly.
  // How the document's content is being composed. "text" is the plain textarea
  // every document has always used; "blocks" is the ordered list that lets an
  // attachment sit *between* two runs of prose, which is the whole point of
  // inline attachments and cannot be expressed with one textarea. Kept as a
  // switch so the common case — typing some text — is not cluttered by an
  // editor most documents never need.
  const [docComposeMode, setDocComposeMode] = React.useState<"text" | "blocks">("text");
  const [docBlocks, setDocBlocks] = React.useState<DocBlock[]>([]);
  const [docContext, setDocContext] = React.useState("");
  const [docEventDate, setDocEventDate] = React.useState("");
  const [docDocumentId, setDocDocumentId] = React.useState("");
  const [docTags, setDocTags] = React.useState("");
  const [docObservationScopes, setDocObservationScopes] = React.useState<
    "per_tag" | "combined" | "all_combinations" | "custom" | "shared"
  >("combined");
  const [docObservationScopesCustom, setDocObservationScopesCustom] = React.useState("");
  const [docMetadata, setDocMetadata] = React.useState("");
  const [docEntities, setDocEntities] = React.useState("");
  const [docAdvancedTab, setDocAdvancedTab] = React.useState<"document" | "tags" | "source">(
    "document"
  );
  const [docAsync, setDocAsync] = React.useState(false);
  const [docStrategy, setDocStrategy] = React.useState("");
  const [isCreatingDoc, setIsCreatingDoc] = React.useState(false);

  // Available strategies for the current bank
  const [bankStrategies, setBankStrategies] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (!docDialogOpen || !currentBank) return;
    client
      .getBankConfig(currentBank)
      .then((resp) => {
        const strategies = resp.config?.retain_strategies;
        setBankStrategies(strategies ? Object.keys(strategies) : []);
      })
      .catch(() => setBankStrategies([]));
  }, [docDialogOpen, currentBank]);

  // File upload state
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [filesMetadata, setFilesMetadata] = React.useState<
    {
      context: string;
      timestamp: string;
      document_id: string;
      tags: string;
      metadata: string;
      strategy: string;
      advancedTab: "document" | "tags" | "source";
      expanded: boolean;
    }[]
  >([]);
  const [uploadProgress, setUploadProgress] = React.useState<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Feature flags
  const [fileUploadEnabled, setFileUploadEnabled] = React.useState<boolean | null>(null);

  // Load feature flags
  React.useEffect(() => {
    client
      .getVersion()
      .then((version) => {
        setFileUploadEnabled(version.features.file_upload_api);
      })
      .catch(() => {
        setFileUploadEnabled(false);
      });
  }, []);

  // Spin the header logo whenever a sidebar item is clicked. Decoupled via a
  // window event (like DOCUMENTS_REFRESH_EVENT) since the sidebar and this header
  // are siblings, not parent/child. onAnimationEnd clears the flag so the next
  // click replays it. (A mid-spin re-click is a no-op — the flag is already set —
  // which is fine; we avoid a requestAnimationFrame restart because rAF is paused
  // in background tabs, which would drop the spin entirely.)
  React.useEffect(() => {
    const spin = () => setLogoSpinning(true);
    window.addEventListener("hindsight:logo-spin", spin);
    return () => window.removeEventListener("hindsight:logo-spin", spin);
  }, []);

  // The banks overview page has its own "create bank" button; the dialog (with its
  // template import) lives here, so that button asks for it rather than duplicating it.
  React.useEffect(() => {
    const openCreate = () => setCreateDialogOpen(true);
    window.addEventListener("hindsight:create-bank", openCreate);
    return () => window.removeEventListener("hindsight:create-bank", openCreate);
  }, []);

  const maxFactCount = React.useMemo(
    () => Math.max(1, ...bankInfos.map((b) => b.fact_count)),
    [bankInfos]
  );
  const spaceOptions = React.useMemo(
    () => (categoryTree?.spaces || []).filter((space: any) => space.space_code !== "default"),
    [categoryTree]
  );

  // Banks arrive already ordered by last write descending, one page at a time, so the
  // list stays in server order — re-sorting it here would only shuffle a later page
  // above an earlier one. The single exception is hoisting the current bank; see
  // hoistCurrentBank for why that one is worth the reorder.
  const orderedBanks = React.useMemo(
    () => hoistCurrentBank(bankInfos, currentBank),
    [bankInfos, currentBank]
  );

  // Search runs server-side (the bank list is paginated), so the input holds a draft
  // that is debounced into a fresh first page.
  const [searchDraft, setSearchDraft] = React.useState("");
  React.useEffect(() => {
    if (!open || searchDraft === bankSearch) return;
    const timer = setTimeout(() => searchBanks(searchDraft), 250);
    return () => clearTimeout(timer);
  }, [open, searchDraft, bankSearch, searchBanks]);

  // Infinite scroll: fetch the next page once the end of the list scrolls into view.
  // The nodes are tracked as state via callback refs, not useRef: the popover content
  // mounts in a portal after the commit that flips `open`, so an effect reading
  // ref.current would find null and never re-run. The observer is also rebuilt
  // whenever a page lands, so a sentinel that is still visible (a page shorter than
  // the list viewport) keeps paging instead of stalling.
  const [listEl, setListEl] = React.useState<HTMLDivElement | null>(null);
  const [sentinelEl, setSentinelEl] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!hasMoreBanks || !listEl || !sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreBanks();
      },
      { root: listEl, rootMargin: "120px" }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [hasMoreBanks, listEl, sentinelEl, loadMoreBanks, bankInfos.length]);

  const handleOpenEditClassification = (bank: any, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Pre-fill classification data from tree if available, else derive defaults
    let match: any = null;
    if (categoryTree?.spaces) {
      for (const sp of categoryTree.spaces) {
        for (const env of sp.environments) {
          const found = env.banks?.find((b: any) => b.bank_id === bank.bank_id);
          if (found) {
            match = { ...found, space_code: sp.space_code, environment: env.env_code };
            break;
          }
        }
        if (match) break;
      }
    }
    setEditingClassification({
      bank_id: bank.bank_id,
      space_code: match?.space_code || "pet_health",
      environment: match?.environment || "test",
      subject_type: match?.subject_type || "pet_profile",
      subject_id: match?.subject_id || "",
      display_name: match?.display_name || bank.name || bank.bank_id,
      tags: match?.tags || "",
    });
    const rawName = match?.display_name || bank.name || bank.bank_id;
    const petName = rawName.split(" (")[0].split(" · ")[0].trim();
    const tagParts = String(match?.tags || "")
      .split(",")
      .map((tag: string) => tag.trim())
      .filter(Boolean);
    const species = ["cat", "dog", "rabbit", "other"].find((item) => tagParts.includes(item));
    setEditingPetName(petName);
    setEditingPetSpecies(species || "cat");
    setEditingPetBreed(
      tagParts.filter((tag: string) => !["cat", "dog", "rabbit", "other"].includes(tag))[0] || ""
    );
    setEditClassDialogOpen(true);
  };

  const handleSaveClassification = async () => {
    if (!editingClassification.bank_id) return;
    setIsSavingClassification(true);
    try {
      const isPetProfile = editingClassification.space_code === "pet_health";
      const displayName = isPetProfile
        ? buildPetDisplayName(editingPetName, editingPetBreed, editingClassification.subject_id)
        : editingClassification.display_name;
      const tags = isPetProfile
        ? [editingPetSpecies, editingPetBreed.trim()].filter(Boolean).join(",")
        : editingClassification.tags;
      await client.saveBankClassification({
        ...editingClassification,
        bank_name: displayName,
        display_name: displayName,
        tags,
      });
      toast.success("分类与别名已更新");
      setEditClassDialogOpen(false);
      await loadCategoryTree();
      await loadBanks();
    } catch (err: any) {
      toast.error(err?.message || "更新分类失败");
    } finally {
      setIsSavingClassification(false);
    }
  };

  const handleCreateSpace = async () => {
    const spaceCode = newSpaceCode.trim().toLowerCase();
    const spaceName = newSpaceName.trim();
    if (!spaceCode || !spaceName) {
      setSpaceError("请填写业务空间编码和名称");
      return;
    }
    setIsCreatingSpace(true);
    setSpaceError(null);
    try {
      await client.saveBankSpace({
        space_code: spaceCode,
        name: spaceName,
        description: newSpaceDescription.trim(),
      });
      await loadCategoryTree();
      setNewBankSpaceCode(spaceCode);
      setEditingClassification((prev) => ({ ...prev, space_code: spaceCode }));
      setSpaceDialogOpen(false);
      setNewSpaceCode("");
      setNewSpaceName("");
      setNewSpaceDescription("");
      toast.success("业务空间已创建");
    } catch (error) {
      setSpaceError(error instanceof Error ? error.message : "创建业务空间失败");
    } finally {
      setIsCreatingSpace(false);
    }
  };

  const toggleEnvCollapse = (key: string) => {
    setCollapsedEnvs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreateBank = async () => {
    if (
      !newBankId.trim() ||
      !newBankName.trim() ||
      (newBankSpaceCode === "pet_health" && !newBankSubjectId.trim())
    )
      return;

    const isPetProfile = newBankSpaceCode === "pet_health";
    const displayName = isPetProfile
      ? buildPetDisplayName(newBankName, newPetBreed, newBankSubjectId)
      : newBankName.trim();
    const tags = isPetProfile ? [newPetSpecies, newPetBreed.trim()].filter(Boolean).join(",") : "";

    setIsCreating(true);
    setCreateError(null);
    setTemplateError(null);

    try {
      // Create the bank first
      await client.createBank(newBankId.trim(), displayName);

      // Try to save classification metadata right away
      try {
        await client.saveBankClassification({
          bank_id: newBankId.trim(),
          bank_name: displayName,
          space_code: newBankSpaceCode,
          environment: newBankEnv,
          subject_type: isPetProfile ? "pet_profile" : "business_object",
          subject_id: newBankSubjectId.trim(),
          display_name: displayName,
          tags,
        });
        // refresh classification tree
        await loadCategoryTree();
      } catch (err) {
        console.warn("Failed to apply category to new bank:", err);
      }

      // If template JSON is provided, import it
      if (templateJson.trim()) {
        let manifest: Record<string, unknown>;
        try {
          manifest = JSON.parse(templateJson.trim());
        } catch {
          setTemplateError("Invalid JSON. Please check the template syntax.");
          setIsCreating(false);
          return;
        }

        try {
          await client.importBankTemplate(newBankId.trim(), manifest);
        } catch (importError) {
          setTemplateError(
            importError instanceof Error
              ? importError.message
              : tAddDocument("failedToImportTemplate")
          );
          setIsCreating(false);
          return;
        }
      }

      await loadBanks();
      setCreateDialogOpen(false);
      setNewBankId("");
      setNewBankName("");
      setNewBankSpaceCode("pet_health");
      setNewBankEnv("test");
      setNewBankSubjectId("");
      setNewPetSpecies("cat");
      setNewPetBreed("");
      setTemplateJson("");
      setTemplateError(null);
      // Navigate to the new bank
      setCurrentBank(newBankId.trim());
      router.push(bankRoute(newBankId.trim(), "?view=data"));
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : tAddDocument("failedToCreateBank"));
    } finally {
      setIsCreating(false);
    }
  };

  const parseMetadata = (s: string): Record<string, string> | undefined => {
    const result: Record<string, string> = {};
    for (const line of s.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key) result[key] = val;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  };

  const parseEntities = (s: string) => {
    const items = s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (items.length === 0) return undefined;
    return items.map((t) => ({ text: t }));
  };

  const scopeLabel = (tags: string[]) => tags.join(", ");

  const scopeQuestion = (tags: string[]): string => {
    if (tags.length === 1) return `What happened with ${tags[0]}?`;
    const allButLast = tags.slice(0, -1).join(", ");
    return `What happened with ${allButLast} and ${tags[tags.length - 1]}?`;
  };

  const computeScopes = (
    tags: string[],
    mode: "per_tag" | "combined" | "all_combinations" | "custom" | "shared"
  ): string[][] => {
    // "shared" is tag-independent: a single global (untagged) scope, matching the
    // server's `parsed === "shared" -> [[]]` handling in consolidator.py.
    if (mode === "shared") return [[]];
    if (mode === "custom") return [];
    if (tags.length === 0) return [];
    if (mode === "per_tag") return tags.map((t) => [t]);
    if (mode === "combined") return [tags];
    // all_combinations: every non-empty subset
    const result: string[][] = [];
    for (let size = 1; size <= tags.length; size++) {
      const combine = (start: number, combo: string[]) => {
        if (combo.length === size) {
          result.push([...combo]);
          return;
        }
        for (let i = start; i < tags.length; i++) combine(i + 1, [...combo, tags[i]]);
      };
      combine(0, []);
    }
    return result;
  };

  const emptyFileMeta = (documentId = "") => ({
    context: "",
    timestamp: "",
    document_id: documentId,
    tags: "",
    metadata: "",
    strategy: "",
    advancedTab: "document" as "document" | "tags" | "source",
    expanded: false,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles((prev) => [...prev, ...files]);
    setFilesMetadata((prev) => [...prev, ...files.map((f) => emptyFileMeta(f.name))]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFilesMetadata((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFileMeta = (
    index: number,
    field:
      | "context"
      | "timestamp"
      | "document_id"
      | "tags"
      | "metadata"
      | "strategy"
      | "advancedTab",
    value: string
  ) => {
    setFilesMetadata((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const toggleFileExpanded = (index: number) => {
    setFilesMetadata((prev) =>
      prev.map((m, i) => (i === index ? { ...m, expanded: !m.expanded } : m))
    );
  };

  const handleUploadFiles = async () => {
    if (!currentBank || selectedFiles.length === 0) return;

    setIsCreatingDoc(true);
    setUploadProgress("");

    try {
      setUploadProgress(`Uploading ${selectedFiles.length} file(s)...`);

      const perFileMeta = filesMetadata.map((meta) => ({
        ...(meta.context && { context: meta.context }),
        ...(meta.timestamp && { timestamp: toIsoTimestamp(meta.timestamp) }),
        ...(meta.document_id && { document_id: meta.document_id }),
        ...(meta.tags && {
          tags: meta.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
        ...(meta.metadata && { metadata: parseMetadata(meta.metadata) }),
        ...(meta.strategy && { strategy: meta.strategy }),
      }));

      await client.uploadFiles({
        bank_id: currentBank,
        files: selectedFiles,
        async: true,
        files_metadata: perFileMeta,
      });

      // Reset form and close dialog
      setDocDialogOpen(false);
      setSelectedFiles([]);
      setFilesMetadata([]);
      setDocTags("");
      setDocAsync(false);
      setUploadProgress("");

      // Nudge the documents view to surface the new file_convert_retain
      // operations right away (it derives pending rows from the server).
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("hindsight:documents-refresh"));
      }

      // Navigate to documents view
      router.push(bankRoute(currentBank!, "?view=documents"));
    } catch (error) {
      // Multipart uploads bypass the API client's shared error interceptor.
      toast.error(error instanceof Error ? error.message : tApiError("upload"));
    } finally {
      setIsCreatingDoc(false);
      setUploadProgress("");
    }
  };

  const handleCreateDocument = async () => {
    const hasBlockContent = docBlocks.some((b) =>
      b.kind === "text" ? b.text.trim().length > 0 : true
    );
    const hasContent = docComposeMode === "blocks" ? hasBlockContent : docContent.trim().length > 0;
    if (!currentBank || !hasContent) return;

    setIsCreatingDoc(true);

    try {
      const parsedTags = docTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const item: {
        content: string | ContentBlock[];
        context?: string;
        timestamp?: string;
        document_id?: string;
        tags?: string[];
        observation_scopes?: "per_tag" | "combined" | "all_combinations" | "shared" | string[][];
        metadata?: Record<string, string>;
        entities?: Array<{ text: string }>;
        strategy?: string;
      } = { content: docContent };
      if (docComposeMode === "blocks") {
        // Sent in the order they were arranged, so an attachment reaches the
        // extractor between the sentences that frame it. An image block for
        // images and a file block for everything else — the distinction the API
        // keeps because the providers keep it.
        item.content = docBlocks
          .filter((b) => (b.kind === "text" ? b.text.trim().length > 0 : true))
          .map((b) =>
            b.kind === "text"
              ? { type: "text" as const, text: b.text }
              : b.mediaType.startsWith("image/")
                ? {
                    type: "image" as const,
                    source: { type: "base64" as const, media_type: b.mediaType, data: b.data },
                  }
                : {
                    type: "file" as const,
                    filename: b.name,
                    source: { type: "base64" as const, media_type: b.mediaType, data: b.data },
                  }
          );
      }
      if (docContext) item.context = docContext;
      if (docEventDate) item.timestamp = toIsoTimestamp(docEventDate);
      if (docDocumentId) item.document_id = docDocumentId;
      if (parsedTags.length > 0) item.tags = parsedTags;
      if (docObservationScopes === "per_tag") {
        item.observation_scopes = "per_tag";
      } else if (docObservationScopes === "combined") {
        item.observation_scopes = "combined";
      } else if (docObservationScopes === "all_combinations") {
        item.observation_scopes = "all_combinations";
      } else if (docObservationScopes === "shared") {
        item.observation_scopes = "shared";
      } else if (docObservationScopes === "custom") {
        const customScopes = docObservationScopesCustom
          .split("\n")
          .map((line) =>
            line
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          )
          .filter((scope) => scope.length > 0);
        if (customScopes.length > 0) item.observation_scopes = customScopes;
      }
      const parsedMeta = parseMetadata(docMetadata);
      if (parsedMeta) item.metadata = parsedMeta;
      const parsedEntities = parseEntities(docEntities);
      if (parsedEntities) item.entities = parsedEntities;
      if (docStrategy) item.strategy = docStrategy;

      await client.retain({
        bank_id: currentBank,
        items: [item],
        async: docAsync,
      });

      // Reset form and close dialog
      setDocDialogOpen(false);
      setDocContent("");
      setDocBlocks([]);
      setDocComposeMode("text");
      setDocContext("");
      setDocEventDate("");
      setDocDocumentId("");
      setDocTags("");
      setDocObservationScopes("combined");
      setDocObservationScopesCustom("");
      setDocMetadata("");
      setDocEntities("");
      setDocAdvancedTab("document");
      setDocAsync(false);
      setDocStrategy("");

      // Navigate to documents view to see the new document
      router.push(bankRoute(currentBank!, "?view=documents"));
    } catch {
      // Error toast is shown automatically by the API client interceptor
    } finally {
      setIsCreatingDoc(false);
    }
  };

  return (
    <div className="bg-card text-card-foreground px-5 py-3 border-b-4 border-primary-gradient">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm">
        {/* Logo, split so only the mark spins on navigation while the wordmark
            stays put. The mark is the standalone favicon.png (so it can rotate
            freely); the wordmark is the right slice of the full lockup (logo.png)
            shown via a cropped background. Their widths sum to the full logo, so
            the two pieces butt together seamlessly at h-10. */}
        {/* The logo is the way back to the banks overview, as it is in most apps. */}
        <button
          type="button"
          className="flex items-center h-10 select-none cursor-pointer"
          aria-label={tNavBank("allBanks")}
          title={tNavBank("allBanks")}
          onClick={() => router.push("/dashboard")}
        >
          <img
            src={withBasePath("/favicon.png")}
            alt=""
            className={cn("h-10 w-auto", logoSpinning && "animate-logo-wiggle")}
            onAnimationEnd={() => setLogoSpinning(false)}
          />
          <div
            className="h-10 w-[99px]"
            style={{
              backgroundImage: `url(${withBasePath("/logo.png")})`,
              backgroundSize: "auto 100%",
              backgroundPosition: "right center",
              backgroundRepeat: "no-repeat",
            }}
          />
        </button>

        {/* Separator */}
        <div className="h-8 w-px bg-border" />

        {/* Memory Bank Selector */}
        <Popover
          open={open}
          onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (isOpen) {
              // Reopen on an unfiltered first page rather than whatever was typed last.
              setSearchDraft("");
              if (bankSearch) searchBanks("");
              else loadBanks();
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[250px] justify-between font-bold border-2 border-primary hover:bg-accent"
            >
              <span className="truncate">
                {currentBankName || currentBank || tNavBank("select")}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[420px] p-0" align="start">
            {/* shouldFilter={false}: matching is done by the server so search reaches
                banks that haven't been paged in yet. */}
            <Command shouldFilter={false}>
              <div className="flex items-center border-b px-2 py-1.5 gap-1.5 bg-muted/20">
                <CommandInput
                  placeholder={tNavBank("search")}
                  value={searchDraft}
                  onValueChange={setSearchDraft}
                  className="flex-1 border-none focus:ring-0 h-8 text-xs"
                />
                <div className="flex items-center gap-1 shrink-0 bg-muted/80 rounded p-0.5 border text-[11px]">
                  <button
                    type="button"
                    onClick={() => setViewMode("classified")}
                    className={cn(
                      "px-2 py-0.5 rounded flex items-center gap-1 transition-colors",
                      viewMode === "classified"
                        ? "bg-background font-semibold text-primary shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title="层级分类视图"
                  >
                    <FolderTree className="h-3 w-3" />
                    <span>分类</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("flat")}
                    className={cn(
                      "px-2 py-0.5 rounded flex items-center gap-1 transition-colors",
                      viewMode === "flat"
                        ? "bg-background font-semibold text-primary shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    title="平铺列表视图"
                  >
                    <Layers className="h-3 w-3" />
                    <span>平铺</span>
                  </button>
                </div>
              </div>

              {viewMode === "classified" &&
                categoryTree?.spaces &&
                categoryTree.spaces.length > 0 && (
                  <div className="flex items-center gap-1 px-2.5 py-1.5 border-b bg-muted/10 overflow-x-auto text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveSpaceCode("all")}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap transition-colors",
                        activeSpaceCode === "all"
                          ? "bg-primary text-primary-foreground font-medium"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      全部空间
                    </button>
                    {categoryTree.spaces.map((sp: any) => (
                      <button
                        key={sp.space_code}
                        type="button"
                        onClick={() => setActiveSpaceCode(sp.space_code)}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap transition-colors",
                          activeSpaceCode === sp.space_code
                            ? "bg-primary text-primary-foreground font-medium"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {sp.space_name}
                      </button>
                    ))}
                  </div>
                )}

              <CommandList
                ref={setListEl}
                className="h-[min(340px,var(--cmdk-list-height,340px))] transition-[height] duration-200 ease-out motion-reduce:transition-none"
              >
                <CommandEmpty>
                  {banksLoading ? (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <Spinner size="sm" />
                      <span>{tCommon("loading")}</span>
                    </div>
                  ) : bankSearch ? (
                    tNavBank("noSearchResults")
                  ) : (
                    tNavBank("empty")
                  )}
                </CommandEmpty>

                {viewMode === "classified" && categoryTree ? (
                  <div className="py-1">
                    {categoryTree.spaces
                      ?.filter(
                        (sp: any) => activeSpaceCode === "all" || sp.space_code === activeSpaceCode
                      )
                      .map((sp: any) => (
                        <div key={sp.space_code} className="mb-2">
                          <div className="px-3 py-1 text-[11px] font-bold text-muted-foreground/80 flex items-center justify-between">
                            <span>{sp.space_name}</span>
                            <span className="text-[10px] font-normal text-muted-foreground/50">
                              {sp.space_code}
                            </span>
                          </div>

                          {sp.environments?.map((env: any) => {
                            const envKey = `${sp.space_code}:${env.env_code}`;
                            const isCollapsed = !!collapsedEnvs[envKey];
                            return (
                              <div key={envKey} className="mt-1">
                                <button
                                  type="button"
                                  onClick={() => toggleEnvCollapse(envKey)}
                                  className="w-full px-3 py-1 text-[11px] font-medium flex items-center justify-between hover:bg-muted/50 rounded transition-colors text-foreground/80"
                                >
                                  <div className="flex items-center gap-1.5">
                                    {isCollapsed ? (
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    <span
                                      className={cn(
                                        "inline-block w-1.5 h-1.5 rounded-full",
                                        env.env_code === "prod"
                                          ? "bg-red-500"
                                          : env.env_code === "test"
                                            ? "bg-amber-500"
                                            : "bg-blue-500"
                                      )}
                                    />
                                    <span>{env.env_name}</span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                                    {env.bank_count} 个档案
                                  </span>
                                </button>

                                {!isCollapsed && (
                                  <div className="pl-2 pr-1 space-y-0.5 mt-0.5">
                                    {env.banks?.map((b: any, index: number) => {
                                      const isSelected = currentBank === b.bank_id;
                                      const bankDetail = bankInfos.find(
                                        (x) => x.bank_id === b.bank_id
                                      );
                                      const factCount = b.fact_count ?? bankDetail?.fact_count ?? 0;
                                      const barPct =
                                        maxFactCount > 0 ? (factCount / maxFactCount) * 100 : 0;
                                      return (
                                        <CommandItem
                                          key={b.bank_id}
                                          value={`${b.display_name} ${b.bank_id} ${b.subject_id} ${b.tags}`}
                                          onSelect={() => {
                                            setCurrentBank(b.bank_id);
                                            setOpen(false);
                                            const view = searchParams.get("view") || "data";
                                            const subTab = searchParams.get("subTab");
                                            const queryString = subTab
                                              ? `?view=${view}&subTab=${subTab}`
                                              : `?view=${view}`;
                                            router.push(bankRoute(b.bank_id, queryString));
                                          }}
                                          className={cn(
                                            "relative overflow-hidden py-2 mb-0.5 group rounded cursor-pointer",
                                            isSelected && "ring-1 ring-inset ring-primary/50"
                                          )}
                                        >
                                          <div
                                            className="absolute inset-y-0 left-0 bg-primary/15 dark:bg-primary/20 rounded-[inherit] transition-all"
                                            style={{ width: `${barPct}%` }}
                                          />
                                          <div className="relative flex items-center w-full gap-1.5 text-xs">
                                            <Check
                                              className={cn(
                                                "h-3.5 w-3.5 shrink-0",
                                                isSelected
                                                  ? "opacity-100 text-primary"
                                                  : "opacity-0"
                                              )}
                                            />
                                            <span
                                              className={cn(
                                                "truncate flex-1",
                                                isSelected
                                                  ? "font-semibold text-foreground"
                                                  : "font-medium text-foreground/90"
                                              )}
                                              title={`${b.display_name} (${b.bank_id})`}
                                            >
                                              {b.display_name}
                                            </span>
                                            {b.tags && (
                                              <span className="hidden group-hover:inline-block px-1 py-0.2 bg-muted/60 text-[10px] text-muted-foreground rounded">
                                                {b.tags.split(",")[0]}
                                              </span>
                                            )}
                                            <button
                                              type="button"
                                              title="修改分类与属性"
                                              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                                              onClick={(e) => handleOpenEditClassification(b, e)}
                                            >
                                              <SlidersHorizontal className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                            </button>
                                            <button
                                              type="button"
                                              aria-label={tNavBank("copyName")}
                                              title={tNavBank("copyName")}
                                              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(b.bank_id).then(
                                                  () => toast.success(tNavBank("copied")),
                                                  () => toast.error(tNavBank("copied"))
                                                );
                                              }}
                                            >
                                              <Copy className="h-3 w-3 text-muted-foreground" />
                                            </button>
                                            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
                                              {factCount > 0 ? (
                                                <>{formatCompact(factCount)}</>
                                              ) : (
                                                <span className="italic text-muted-foreground/40">
                                                  empty
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}

                    {/* Unclassified Group if any */}
                    {categoryTree.unclassified_banks &&
                      categoryTree.unclassified_banks.length > 0 && (
                        <div className="mt-2 border-t pt-2">
                          <div className="px-3 py-1 text-[11px] font-bold text-muted-foreground/80 flex items-center justify-between">
                            <span className="text-amber-600 dark:text-amber-400">未分类记忆库</span>
                            <span className="text-[10px] text-muted-foreground/60">
                              {categoryTree.unclassified_banks.length} 个
                            </span>
                          </div>
                          <div className="pl-2 pr-1 space-y-0.5 mt-0.5">
                            {categoryTree.unclassified_banks.map((b: any) => {
                              const isSelected = currentBank === b.bank_id;
                              const bankDetail = bankInfos.find((x) => x.bank_id === b.bank_id);
                              const factCount = b.fact_count ?? bankDetail?.fact_count ?? 0;
                              const barPct =
                                maxFactCount > 0 ? (factCount / maxFactCount) * 100 : 0;
                              return (
                                <CommandItem
                                  key={b.bank_id}
                                  value={`${b.display_name || b.bank_id} ${b.bank_id}`}
                                  onSelect={() => {
                                    setCurrentBank(b.bank_id);
                                    setOpen(false);
                                    const view = searchParams.get("view") || "data";
                                    const subTab = searchParams.get("subTab");
                                    const queryString = subTab
                                      ? `?view=${view}&subTab=${subTab}`
                                      : `?view=${view}`;
                                    router.push(bankRoute(b.bank_id, queryString));
                                  }}
                                  className={cn(
                                    "relative overflow-hidden py-2 mb-0.5 group rounded cursor-pointer",
                                    isSelected && "ring-1 ring-inset ring-primary/50"
                                  )}
                                >
                                  <div
                                    className="absolute inset-y-0 left-0 bg-primary/15 dark:bg-primary/20 rounded-[inherit] transition-all"
                                    style={{ width: `${barPct}%` }}
                                  />
                                  <div className="relative flex items-center w-full gap-1.5 text-xs">
                                    <Check
                                      className={cn(
                                        "h-3.5 w-3.5 shrink-0",
                                        isSelected ? "opacity-100 text-primary" : "opacity-0"
                                      )}
                                    />
                                    <span
                                      className={cn(
                                        "truncate flex-1 font-mono text-[11px]",
                                        isSelected ? "font-semibold" : "text-muted-foreground"
                                      )}
                                      title={b.bank_id}
                                    >
                                      {b.display_name || b.bank_id}
                                    </span>
                                    <button
                                      type="button"
                                      title="设置分类"
                                      className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                                      onClick={(e) => handleOpenEditClassification(b, e)}
                                    >
                                      <Tag className="h-3 w-3 text-amber-600 hover:text-amber-500" />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={tNavBank("copyName")}
                                      title={tNavBank("copyName")}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(b.bank_id).then(
                                          () => toast.success(tNavBank("copied")),
                                          () => toast.error(tNavBank("copied"))
                                        );
                                      }}
                                    >
                                      <Copy className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                    <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
                                      {factCount > 0 ? (
                                        <>{formatCompact(factCount)}</>
                                      ) : (
                                        <span className="italic text-muted-foreground/40">
                                          empty
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <CommandGroup
                    className={cn(
                      "transition-opacity duration-150 motion-reduce:transition-none",
                      banksLoading && bankInfos.length > 0 && "opacity-40"
                    )}
                  >
                    {orderedBanks.map((bank, index) => {
                      const barPct = (bank.fact_count / maxFactCount) * 100;
                      const isSelected = currentBank === bank.bank_id;
                      const lastWriteAt = bank.last_write_at || bank.last_document_at;
                      return (
                        <CommandItem
                          key={bank.bank_id}
                          value={`${bank.name || bank.bank_id} ${bank.bank_id}`}
                          onSelect={(value) => {
                            setCurrentBank(bank.bank_id);
                            setOpen(false);
                            const view = searchParams.get("view") || "data";
                            const subTab = searchParams.get("subTab");
                            const queryString = subTab
                              ? `?view=${view}&subTab=${subTab}`
                              : `?view=${view}`;
                            router.push(bankRoute(bank.bank_id, queryString));
                          }}
                          className={cn(
                            "relative overflow-hidden py-2.5 mb-0.5 group animate-list-row-enter",
                            isSelected && "ring-1 ring-inset ring-primary/50"
                          )}
                          style={{
                            animationDelay: `${Math.min(index % BANKS_PAGE_SIZE, 10) * 18}ms`,
                          }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-primary/15 dark:bg-primary/20 rounded-[inherit] transition-all"
                            style={{ width: `${barPct}%` }}
                          />
                          <div className="relative flex items-center w-full gap-2">
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isSelected ? "opacity-100 text-primary" : "opacity-0"
                              )}
                            />
                            <span
                              className={cn(
                                "truncate flex-1",
                                isSelected ? "font-semibold" : "font-medium"
                              )}
                              title={bank.name || bank.bank_id}
                            >
                              {bank.name || bank.bank_id}
                            </span>
                            <button
                              type="button"
                              title="修改分类与属性"
                              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => handleOpenEditClassification(bank, e)}
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </button>
                            <button
                              type="button"
                              aria-label={tNavBank("copyName")}
                              title={tNavBank("copyName")}
                              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-accent-foreground/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(bank.bank_id).then(
                                  () => toast.success(tNavBank("copied")),
                                  () => toast.error(tNavBank("copied"))
                                );
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">
                              {bank.fact_count > 0 ? (
                                <>
                                  {formatCompact(bank.fact_count)}
                                  <span className="ml-1.5 text-muted-foreground/40">
                                    {lastWriteAt ? formatTimeAgo(lastWriteAt) : ""}
                                  </span>
                                </>
                              ) : (
                                <span className="italic text-muted-foreground/40">empty</span>
                              )}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                {hasMoreBanks && viewMode === "flat" && (
                  <div ref={setSentinelEl} className="flex items-center justify-center py-2">
                    {banksLoadingMore && (
                      <span className="animate-soft-fade-in">
                        <Spinner size="sm" />
                      </span>
                    )}
                  </div>
                )}
              </CommandList>
              {/* Footer: Create new bank */}
              <div className="border-t border-border p-1">
                <button
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setOpen(false);
                    setCreateDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span>{tNavBank("create")}</span>
                </button>
              </div>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Separator */}
        <div className="h-8 w-px bg-border" />

        {/* Add Document Button */}
        {currentBank && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setDocDialogOpen(true)}
            title={tAddDocument("addDocumentToCurrentBank")}
            data-add-document
          >
            <Plus className="h-4 w-4" />
            <span>{tAddDocument("addDocumentButton")}</span>
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        <Button variant="ghost" asChild>
          <a href={withBasePath("/api-access")} title={tNav("apiAccess")}>
            <Code2 className="h-5 w-5" />
            <span className="hidden sm:inline">{tNav("apiAccess")}</span>
          </a>
        </Button>

        {/* GitHub Link */}
        <a
          href="https://github.com/vectorize-io/hindsight"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title={tNav("viewOnGitHub")}
        >
          <Github className="h-5 w-5" />
          <span className="text-sm font-medium">GitHub</span>
        </a>

        {/* Separator */}
        <div className="h-8 w-px bg-border" />

        <ControlPlaneActions authEnabled={authEnabled} />

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>{tAddDocument("createBankTitle")}</DialogTitle>
            </DialogHeader>
            <div
              className="py-4 space-y-4"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !isCreating &&
                  !useTemplate &&
                  newBankId.trim() &&
                  newBankName.trim() &&
                  (newBankSpaceCode !== "pet_health" || newBankSubjectId.trim()) &&
                  e.target instanceof HTMLInputElement
                ) {
                  handleCreateBank();
                }
              }}
            >
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {newBankSpaceCode === "pet_health" ? "宠物名称" : "记忆库名称"}{" "}
                  <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder={
                    newBankSpaceCode === "pet_health" ? "例如：小呱" : "例如：客户支持记忆库"
                  }
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !isCreating &&
                      !useTemplate &&
                      newBankId.trim() &&
                      newBankName.trim() &&
                      (newBankSpaceCode !== "pet_health" || newBankSubjectId.trim())
                    ) {
                      handleCreateBank();
                    }
                  }}
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  {newBankSpaceCode === "pet_health"
                    ? "这是宠物档案的主要展示名称。"
                    : "这是业务记忆库的主要展示名称。"}
                </p>
              </div>
              <Input
                placeholder={
                  newBankSpaceCode === "pet_health"
                    ? "根据环境和档案号自动生成"
                    : tAddDocument("createBankIdPlaceholder")
                }
                value={newBankId}
                onChange={(e) => setNewBankId(e.target.value)}
                readOnly={newBankSpaceCode === "pet_health"}
                disabled={newBankSpaceCode === "pet_health"}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !isCreating &&
                    !useTemplate &&
                    newBankId.trim() &&
                    newBankName.trim() &&
                    (newBankSpaceCode !== "pet_health" || newBankSubjectId.trim())
                  ) {
                    handleCreateBank();
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground -mt-2">
                {newBankSpaceCode === "pet_health"
                  ? "系统标识：由环境和宠物档案号自动生成，创建后不建议修改。"
                  : "系统标识：用于 API 调用和系统内部关联。"}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      业务空间 (Space)
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="新建业务空间"
                      onClick={() => {
                        setSpaceError(null);
                        setSpaceDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Select value={newBankSpaceCode} onValueChange={setNewBankSpaceCode}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {spaceOptions.map((space: any) => (
                        <SelectItem key={space.space_code} value={space.space_code}>
                          {space.space_name} ({space.space_code})
                        </SelectItem>
                      ))}
                      <SelectItem value="default">默认未分类</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    系统环境 (Environment)
                  </label>
                  <Select value={newBankEnv} onValueChange={setNewBankEnv}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prod">正式环境</SelectItem>
                      <SelectItem value="test">测试环境</SelectItem>
                      <SelectItem value="dev">开发环境</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {newBankSpaceCode === "pet_health" ? "宠物档案号" : "业务对象编号"}
                  {newBankSpaceCode === "pet_health" && (
                    <span className="text-destructive"> *</span>
                  )}
                </label>
                <Input
                  className="h-9"
                  placeholder={newBankSpaceCode === "pet_health" ? "例如：82 或 PET-00082" : "可选"}
                  value={newBankSubjectId}
                  onChange={(e) => setNewBankSubjectId(e.target.value)}
                />
              </div>
              {newBankSpaceCode === "pet_health" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      宠物类型
                    </label>
                    <Select value={newPetSpecies} onValueChange={setNewPetSpecies}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cat">猫</SelectItem>
                        <SelectItem value="dog">狗</SelectItem>
                        <SelectItem value="rabbit">兔</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      品种（可选）
                    </label>
                    <Input
                      className="h-9"
                      placeholder="例如：豹猫、边牧"
                      value={newPetBreed}
                      onChange={(e) => setNewPetBreed(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={useTemplate}
                    onCheckedChange={(checked) => {
                      setUseTemplate(checked);
                      if (!checked) {
                        setTemplateJson("");
                        setTemplateError(null);
                      }
                    }}
                  />
                  <label className="text-sm font-medium">
                    {tAddDocument("importFromTemplateLabel")}
                  </label>
                </div>
                {useTemplate && (
                  <a
                    href="https://hindsight.vectorize.io/templates"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {tAddDocument("browseTemplates")}
                  </a>
                )}
              </div>
              {useTemplate && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {tAddDocument("templateManifestHelp")}
                  </p>
                  <Textarea
                    placeholder='{"version": "1", "bank": {...}, "mental_models": [...]}'
                    value={templateJson}
                    onChange={(e) => {
                      setTemplateJson(e.target.value);
                      setTemplateError(null);
                    }}
                    className="font-mono text-xs min-h-[120px]"
                  />
                </div>
              )}
              {templateError && (
                <p className="text-sm text-destructive whitespace-pre-wrap">{templateError}</p>
              )}
              {createError && <p className="text-sm text-destructive">{createError}</p>}
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreateDialogOpen(false);
                  setNewBankId("");
                  setNewBankName("");
                  setNewBankSubjectId("");
                  setNewPetSpecies("cat");
                  setNewPetBreed("");
                  setUseTemplate(false);
                  setTemplateJson("");
                  setCreateError(null);
                  setTemplateError(null);
                }}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                onClick={handleCreateBank}
                disabled={
                  isCreating ||
                  !newBankId.trim() ||
                  !newBankName.trim() ||
                  (newBankSpaceCode === "pet_health" && !newBankSubjectId.trim())
                }
              >
                {isCreating ? tAddDocument("creating") : tCommon("create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={spaceDialogOpen}
          onOpenChange={(open) => {
            setSpaceDialogOpen(open);
            if (!open) setSpaceError(null);
          }}
        >
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>新建业务空间</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">空间编码</label>
                <Input
                  placeholder="例如：pet_health"
                  value={newSpaceCode}
                  onChange={(event) => setNewSpaceCode(event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  用于接口和数据筛选，只能使用小写字母、数字、下划线或短横线。
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">空间名称</label>
                <Input
                  placeholder="例如：宠物健康档案"
                  value={newSpaceName}
                  onChange={(event) => setNewSpaceName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">说明（可选）</label>
                <Textarea
                  placeholder="这个业务空间用于存放什么类型的记忆库？"
                  value={newSpaceDescription}
                  onChange={(event) => setNewSpaceDescription(event.target.value)}
                  className="min-h-[80px]"
                />
              </div>
              {spaceError && <p className="text-sm text-destructive">{spaceError}</p>}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setSpaceDialogOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={handleCreateSpace} disabled={isCreatingSpace}>
                {isCreatingSpace ? "创建中…" : "创建空间"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Classification Dialog */}
        <Dialog open={editClassDialogOpen} onOpenChange={setEditClassDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <span>编辑记忆库分类与档案信息</span>
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-4 text-sm">
              <div className="rounded-md bg-muted/50 p-2.5 font-mono text-xs text-muted-foreground break-all">
                Bank ID:{" "}
                <span className="text-foreground font-semibold">
                  {editingClassification.bank_id}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    业务空间 (Space)
                  </label>
                  <select
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs"
                    value={editingClassification.space_code}
                    onChange={(e) =>
                      setEditingClassification((prev) => ({ ...prev, space_code: e.target.value }))
                    }
                  >
                    {spaceOptions.map((space: any) => (
                      <option key={space.space_code} value={space.space_code}>
                        {space.space_name} ({space.space_code})
                      </option>
                    ))}
                    <option value="default">默认未分类 (default)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    所属环境 (Environment)
                  </label>
                  <select
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs"
                    value={editingClassification.environment}
                    onChange={(e) =>
                      setEditingClassification((prev) => ({ ...prev, environment: e.target.value }))
                    }
                  >
                    <option value="test">测试环境 (test)</option>
                    <option value="dev">开发环境 (dev)</option>
                    <option value="prod">正式生产 (prod)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                  {editingClassification.space_code === "pet_health" ? "宠物名称" : "记忆库名称"}
                </label>
                <input
                  type="text"
                  placeholder={
                    editingClassification.space_code === "pet_health"
                      ? "例如：小呱"
                      : "例如：客户支持记忆库"
                  }
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs"
                  value={
                    editingClassification.space_code === "pet_health"
                      ? editingPetName
                      : editingClassification.display_name
                  }
                  onChange={(e) => {
                    if (editingClassification.space_code === "pet_health")
                      setEditingPetName(e.target.value);
                    else
                      setEditingClassification((prev) => ({
                        ...prev,
                        display_name: e.target.value,
                      }));
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    {editingClassification.space_code === "pet_health"
                      ? "宠物档案号"
                      : "业务对象编号"}
                  </label>
                  <input
                    type="text"
                    placeholder="例如: 82"
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs"
                    value={editingClassification.subject_id}
                    onChange={(e) =>
                      setEditingClassification((prev) => ({ ...prev, subject_id: e.target.value }))
                    }
                  />
                </div>
                {editingClassification.space_code === "pet_health" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      宠物类型
                    </label>
                    <select
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs"
                      value={editingPetSpecies}
                      onChange={(e) => setEditingPetSpecies(e.target.value)}
                    >
                      <option value="cat">猫</option>
                      <option value="dog">狗</option>
                      <option value="rabbit">兔</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                )}
                {editingClassification.space_code === "pet_health" && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                      品种（可选）
                    </label>
                    <input
                      type="text"
                      placeholder="例如：豹猫、边牧"
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs"
                      value={editingPetBreed}
                      onChange={(e) => setEditingPetBreed(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    扩展标签（逗号分隔）
                  </label>
                  <input
                    type="text"
                    placeholder="例如: cat,bengal,vip"
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs"
                    value={editingClassification.tags}
                    onChange={(e) =>
                      setEditingClassification((prev) => ({ ...prev, tags: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditClassDialogOpen(false)}
                disabled={isSavingClassification}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleSaveClassification}
                disabled={isSavingClassification}
              >
                {isSavingClassification ? "保存中..." : "保存分类"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={docDialogOpen} onOpenChange={setDocDialogOpen}>
          <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{tAddDocument("dialogTitle")}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {tAddDocument("dialogSubtitle")}
                <span className="font-semibold">{currentBank}</span>
              </p>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1">
              {/* Content — tab-switched input only */}
              <Tabs value={docTab} onValueChange={(v) => setDocTab(v as "text" | "upload")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {tAddDocument("tabText")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="upload"
                    className="flex items-center gap-2"
                    disabled={fileUploadEnabled === false}
                  >
                    {fileUploadEnabled === false ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {tAddDocument("tabUploadFiles")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-sm text-foreground">
                      {tAddDocument("contentLabel")}
                    </label>
                    {/* The switch, rather than always showing the block editor:
                        most documents are just text, and an ordered block list
                        would be clutter in front of every one of them. */}
                    <div className="flex items-center rounded border border-border overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => setDocComposeMode("text")}
                        className={`px-2 py-1 ${
                          docComposeMode === "text"
                            ? "bg-muted text-foreground font-semibold"
                            : "text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {tAddDocument("composeText")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Carry the typed text across so switching never
                          // silently loses what is already written.
                          setDocBlocks((current) =>
                            current.length > 0 ? current : [{ kind: "text", text: docContent }]
                          );
                          setDocComposeMode("blocks");
                        }}
                        className={`px-2 py-1 border-l border-border ${
                          docComposeMode === "blocks"
                            ? "bg-muted text-foreground font-semibold"
                            : "text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {tAddDocument("composeBlocks")}
                      </button>
                    </div>
                  </div>

                  {docComposeMode === "text" ? (
                    <Textarea
                      value={docContent}
                      onChange={(e) => setDocContent(e.target.value)}
                      placeholder={tAddDocument("contentPlaceholder")}
                      className="min-h-[150px] resize-y"
                      autoFocus
                    />
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {tAddDocument("composeBlocksHint")}
                      </p>
                      {docBlocks.map((block, index) => (
                        <div
                          key={index}
                          className="group relative rounded border border-border bg-muted/20 p-2"
                        >
                          {/* Controls overlay the block rather than sitting in a
                              column beside it: at this width a fixed gutter of
                              arrows and a close button squeezed the content into
                              a sliver. Revealed on hover and on keyboard focus,
                              so they stay reachable without a pointer. */}
                          <div className="absolute top-1 right-1 flex items-center gap-0.5 rounded bg-background/80 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              type="button"
                              aria-label={tAddDocument("blockMoveUp")}
                              disabled={index === 0}
                              onClick={() =>
                                setDocBlocks((current) => {
                                  const next = [...current];
                                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                  return next;
                                })
                              }
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={tAddDocument("blockMoveDown")}
                              disabled={index === docBlocks.length - 1}
                              onClick={() =>
                                setDocBlocks((current) => {
                                  const next = [...current];
                                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                  return next;
                                })
                              }
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={tAddDocument("blockRemove")}
                              onClick={() =>
                                setDocBlocks((current) => current.filter((_, i) => i !== index))
                              }
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {block.kind === "text" ? (
                            <Textarea
                              value={block.text}
                              onChange={(e) =>
                                setDocBlocks((current) =>
                                  current.map((b, i) =>
                                    i === index && b.kind === "text"
                                      ? { ...b, text: e.target.value }
                                      : b
                                  )
                                )
                              }
                              placeholder={tAddDocument("contentPlaceholder")}
                              // Room for the overlay so the first line never runs
                              // underneath it.
                              className="min-h-[80px] resize-y border-0 bg-transparent p-0 pr-20 shadow-none focus-visible:ring-0"
                            />
                          ) : (
                            <div className="flex items-center gap-2 pr-20 text-sm">
                              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{block.name}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {(block.size / 1024).toFixed(0)} KB
                              </span>
                            </div>
                          )}
                        </div>
                      ))}

                      <input
                        id="doc-attachment-input"
                        type="file"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          const encoded = await Promise.all(
                            files.map(
                              (file) =>
                                new Promise<DocBlock>((resolve, reject) => {
                                  const reader = new FileReader();
                                  reader.onerror = () => reject(reader.error);
                                  reader.onload = () =>
                                    resolve({
                                      kind: "attachment",
                                      name: file.name,
                                      // Some browsers report "" for unusual
                                      // extensions; the API accepts any
                                      // well-formed type, so fall back to a
                                      // generic one rather than refusing it.
                                      mediaType: file.type || "application/octet-stream",
                                      size: file.size,
                                      // readAsDataURL gives "data:<type>;base64,<payload>";
                                      // the API wants the payload alone.
                                      data: String(reader.result).split(",", 2)[1] ?? "",
                                    });
                                  reader.readAsDataURL(file);
                                })
                            )
                          );
                          setDocBlocks((current) => [...current, ...encoded]);
                          // Let the same file be picked again after removal.
                          e.target.value = "";
                        }}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="outline" size="sm">
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            {tAddDocument("blockAdd")}
                            <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onSelect={() =>
                              setDocBlocks((current) => [...current, { kind: "text", text: "" }])
                            }
                          >
                            {tAddDocument("blockAddText")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              document.getElementById("doc-attachment-input")?.click()
                            }
                          >
                            {tAddDocument("blockAddAttachment")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="upload" className="mt-3">
                  {fileUploadEnabled === false ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                      <Lock className="h-12 w-12 text-muted-foreground/50" />
                      <div>
                        <p className="font-semibold text-foreground">
                          {tAddDocument("fileUploadDisabled")}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {tAddDocument("fileUploadDisabledMessage")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {tAddDocument.rich("fileUploadEnableHint", {
                            code: (chunks) => (
                              <code className="bg-muted px-1 py-0.5 rounded">{chunks}</code>
                            ),
                          })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
                      >
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <span className="text-sm text-muted-foreground">
                          {tAddDocument("clickToSelectFiles")}
                        </span>
                      </label>

                      {selectedFiles.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {selectedFiles.map((file, index) => {
                            const meta = filesMetadata[index];
                            const hasData =
                              meta &&
                              (meta.context ||
                                meta.timestamp ||
                                meta.document_id ||
                                meta.tags ||
                                meta.metadata);
                            return (
                              <div
                                key={`${file.name}-${index}`}
                                className="bg-muted rounded-md overflow-hidden"
                              >
                                {/* File row header */}
                                <div className="flex items-center gap-1 px-2 py-2">
                                  <button
                                    type="button"
                                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:opacity-75 transition-opacity"
                                    onClick={() => toggleFileExpanded(index)}
                                    title={tAddDocument("editFileMetadata")}
                                  >
                                    {meta?.expanded ? (
                                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <FileText
                                      className={`h-4 w-4 shrink-0 ${hasData ? "text-primary" : "text-muted-foreground"}`}
                                    />
                                    <span className="text-sm truncate">{file.name}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      ({(file.size / 1024).toFixed(1)} KB)
                                    </span>
                                  </button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 shrink-0"
                                    onClick={() => removeFile(index)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>

                                {/* Per-file metadata form */}
                                {meta?.expanded && (
                                  <div className="border-t border-border/50">
                                    <Tabs
                                      value={meta.advancedTab}
                                      onValueChange={(v) => updateFileMeta(index, "advancedTab", v)}
                                    >
                                      <TabsList className="w-full border-b border-border bg-transparent h-8 p-0 gap-0 justify-start rounded-none">
                                        {(["document", "tags", "source"] as const).map((t) => (
                                          <TabsTrigger
                                            key={t}
                                            value={t}
                                            className="rounded-none h-full px-4 text-xs font-medium bg-transparent shadow-none text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px capitalize"
                                          >
                                            {t}
                                          </TabsTrigger>
                                        ))}
                                      </TabsList>
                                      <div className="px-3 py-3 space-y-2">
                                        <TabsContent value="document" className="mt-0 space-y-2">
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <label className="font-bold block mb-1 text-sm text-foreground">
                                                {tAddDocument("eventDateLabel")}
                                              </label>
                                              <Input
                                                type="date"
                                                value={meta.timestamp}
                                                onChange={(e) =>
                                                  updateFileMeta(index, "timestamp", e.target.value)
                                                }
                                                className="h-8 text-sm text-foreground"
                                              />
                                            </div>
                                            <div>
                                              <label className="font-bold block mb-1 text-sm text-foreground">
                                                {tAddDocument("documentIdLabel")}
                                              </label>
                                              <Input
                                                value={meta.document_id}
                                                onChange={(e) =>
                                                  updateFileMeta(
                                                    index,
                                                    "document_id",
                                                    e.target.value
                                                  )
                                                }
                                                placeholder={tAddDocument("fileIdPlaceholder")}
                                                className="h-8 text-sm"
                                              />
                                            </div>
                                          </div>
                                          <div>
                                            <label className="font-bold block mb-1 text-sm text-foreground">
                                              {tAddDocument("strategyLabel")}
                                            </label>
                                            {bankStrategies.length > 0 ? (
                                              <Select
                                                value={meta.strategy || "__none__"}
                                                onValueChange={(v) =>
                                                  updateFileMeta(
                                                    index,
                                                    "strategy",
                                                    v === "__none__" ? "" : v
                                                  )
                                                }
                                              >
                                                <SelectTrigger className="w-full h-8 text-sm">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="__none__">
                                                    <span className="text-muted-foreground italic">
                                                      {tAddDocument("strategyDefault")}
                                                    </span>
                                                  </SelectItem>
                                                  {bankStrategies.map((name) => (
                                                    <SelectItem key={name} value={name}>
                                                      {name}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            ) : (
                                              <Input
                                                value={meta.strategy}
                                                onChange={(e) =>
                                                  updateFileMeta(index, "strategy", e.target.value)
                                                }
                                                placeholder={tAddDocument("strategyPlaceholder")}
                                                className="h-8 text-sm"
                                              />
                                            )}
                                          </div>
                                        </TabsContent>
                                        <TabsContent value="tags" className="mt-0 space-y-2">
                                          <div>
                                            <label className="font-bold block mb-1 text-sm text-foreground">
                                              {tAddDocument("tagsLabel")}
                                            </label>
                                            <Input
                                              value={meta.tags}
                                              onChange={(e) =>
                                                updateFileMeta(index, "tags", e.target.value)
                                              }
                                              placeholder={tAddDocument("fileTagsPlaceholder")}
                                              className="h-8 text-sm"
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">
                                              {tAddDocument("fileTagsHelp")}
                                            </p>
                                          </div>
                                        </TabsContent>
                                        <TabsContent value="source" className="mt-0 space-y-2">
                                          <div>
                                            <label className="font-bold block mb-1 text-sm text-foreground">
                                              {tAddDocument("contextLabel")}
                                            </label>
                                            <Input
                                              value={meta.context}
                                              onChange={(e) =>
                                                updateFileMeta(index, "context", e.target.value)
                                              }
                                              placeholder={tAddDocument("fileContextPlaceholder")}
                                              className="h-8 text-sm"
                                            />
                                          </div>
                                          <div>
                                            <label className="font-bold block mb-1 text-sm text-foreground">
                                              Metadata
                                            </label>
                                            <Textarea
                                              value={meta.metadata}
                                              onChange={(e) =>
                                                updateFileMeta(index, "metadata", e.target.value)
                                              }
                                              placeholder={"source: slack\nchannel: engineering"}
                                              className="min-h-[52px] resize-y font-mono text-sm"
                                            />
                                          </div>
                                        </TabsContent>
                                      </div>
                                    </Tabs>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {uploadProgress && (
                        <p className="text-sm text-muted-foreground mt-2">{uploadProgress}</p>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>

              {/* Context — text tab only */}
              {docTab === "text" && (
                <div>
                  <label className="font-bold block mb-1 text-sm text-foreground">
                    {tAddDocument("contextLabel")}
                  </label>
                  <Input
                    type="text"
                    value={docContext}
                    onChange={(e) => setDocContext(e.target.value)}
                    placeholder={tAddDocument("contextPlaceholder")}
                  />
                </div>
              )}

              {/* Advanced section — text only */}
              {docTab === "text" && (
                <div>
                  <Tabs
                    value={docAdvancedTab}
                    onValueChange={(v) => setDocAdvancedTab(v as "document" | "tags" | "source")}
                  >
                    <TabsList className="w-full border-b border-border bg-transparent h-8 p-0 gap-0 justify-start rounded-none">
                      <TabsTrigger
                        value="document"
                        className="rounded-none h-full px-4 text-xs font-medium bg-transparent shadow-none text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px"
                      >
                        Document
                      </TabsTrigger>
                      <TabsTrigger
                        value="tags"
                        className="rounded-none h-full px-4 text-xs font-medium bg-transparent shadow-none text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px"
                      >
                        Tags
                      </TabsTrigger>
                      <TabsTrigger
                        value="source"
                        className="rounded-none h-full px-4 text-xs font-medium bg-transparent shadow-none text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary -mb-px"
                      >
                        Source
                      </TabsTrigger>
                    </TabsList>

                    <div className="pt-3 space-y-3">
                      <TabsContent value="document" className="mt-0 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="font-bold block mb-1 text-sm text-foreground">
                              {tAddDocument("eventDateLabel")}
                            </label>
                            <Input
                              type="date"
                              value={docEventDate}
                              onChange={(e) => setDocEventDate(e.target.value)}
                              className="text-foreground"
                            />
                          </div>
                          <div>
                            <label className="font-bold block mb-1 text-sm text-foreground">
                              {tAddDocument("documentIdLabel")}
                            </label>
                            <Input
                              type="text"
                              value={docDocumentId}
                              onChange={(e) => setDocDocumentId(e.target.value)}
                              placeholder={tAddDocument("documentIdPlaceholder")}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="font-bold block mb-1 text-sm text-foreground">
                            {tAddDocument("strategyLabel")}
                          </label>
                          {bankStrategies.length > 0 ? (
                            <Select
                              value={docStrategy || "__none__"}
                              onValueChange={(v) => setDocStrategy(v === "__none__" ? "" : v)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">
                                  <span className="text-muted-foreground italic">
                                    {tAddDocument("strategyDefault")}
                                  </span>
                                </SelectItem>
                                {bankStrategies.map((name) => (
                                  <SelectItem key={name} value={name}>
                                    {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type="text"
                              value={docStrategy}
                              onChange={(e) => setDocStrategy(e.target.value)}
                              placeholder={tAddDocument("strategyPlaceholder")}
                            />
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {tAddDocument("strategyHelpText")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="async-doc"
                            checked={docAsync}
                            onCheckedChange={(checked) => setDocAsync(checked as boolean)}
                          />
                          <label
                            htmlFor="async-doc"
                            className="text-sm cursor-pointer text-foreground"
                          >
                            {tAddDocument("asyncLabel")}
                          </label>
                        </div>
                      </TabsContent>

                      <TabsContent value="tags" className="mt-0 space-y-3">
                        <div>
                          <label className="font-bold block mb-1 text-sm text-foreground">
                            {tAddDocument("tagsLabel")}
                          </label>
                          <Input
                            type="text"
                            value={docTags}
                            onChange={(e) => setDocTags(e.target.value)}
                            placeholder={tAddDocument("tagsPlaceholder")}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {tAddDocument("tagsHelpText")}
                          </p>
                        </div>
                        <div>
                          <label className="font-bold block mb-1 text-sm text-foreground">
                            {tAddDocument("observationScopesLabel")}
                          </label>
                          <Select
                            value={docObservationScopes}
                            onValueChange={(v) =>
                              setDocObservationScopes(
                                v as
                                  | "per_tag"
                                  | "combined"
                                  | "all_combinations"
                                  | "custom"
                                  | "shared"
                              )
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_tag">
                                {tAddDocument("observationScopePerTag")}
                              </SelectItem>
                              <SelectItem value="combined">Combined</SelectItem>
                              <SelectItem value="all_combinations">
                                {tAddDocument("observationScopeAllCombinations")}
                              </SelectItem>
                              <SelectItem value="shared">
                                {tAddDocument("observationScopeShared")}
                              </SelectItem>
                              <SelectItem value="custom">
                                {tAddDocument("observationScopeCustom")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {docObservationScopes === "shared" && (
                            <p className="text-xs text-muted-foreground mt-1.5 italic">
                              {tAddDocument("observationScopeSharedHelp")}
                            </p>
                          )}
                          {docObservationScopes !== "custom" &&
                            docObservationScopes !== "shared" &&
                            (() => {
                              const tags = docTags
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean);
                              const scopes = computeScopes(tags, docObservationScopes);
                              const MAX = 6;
                              if (tags.length === 0) {
                                return (
                                  <p className="text-xs text-muted-foreground/60 mt-1.5 italic">
                                    {tAddDocument("observationScopesEmpty")}
                                  </p>
                                );
                              }
                              return (
                                <ul className="mt-2 space-y-1.5">
                                  {scopes.slice(0, MAX).map((scope, i) => (
                                    <li key={i} className="flex flex-col gap-0.5">
                                      <span className="text-xs font-mono text-foreground">
                                        {scopeLabel(scope)}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {scopeQuestion(scope)}
                                      </span>
                                    </li>
                                  ))}
                                  {scopes.length > MAX && (
                                    <li className="text-xs text-muted-foreground">
                                      {tAddDocument("moreScopes", { count: scopes.length - MAX })}
                                    </li>
                                  )}
                                </ul>
                              );
                            })()}
                          {docObservationScopes === "custom" && (
                            <Textarea
                              value={docObservationScopesCustom}
                              onChange={(e) => setDocObservationScopesCustom(e.target.value)}
                              placeholder={"user:alice\nuser:alice, place:online"}
                              className="min-h-[72px] resize-y font-mono text-sm mt-2"
                            />
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="source" className="mt-0 space-y-3">
                        <div>
                          <label className="font-bold block mb-1 text-sm text-foreground">
                            Metadata
                          </label>
                          <Textarea
                            value={docMetadata}
                            onChange={(e) => setDocMetadata(e.target.value)}
                            placeholder={"source: slack\nchannel: engineering"}
                            className="min-h-[72px] resize-y font-mono text-sm"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {tAddDocument.rich("metadataHelpText", {
                              code: (chunks) => (
                                <code className="bg-muted px-0.5 rounded">{chunks}</code>
                              ),
                            })}
                          </p>
                        </div>
                        <div>
                          <label className="font-bold block mb-1 text-sm text-foreground">
                            Entities
                          </label>
                          <Input
                            type="text"
                            value={docEntities}
                            onChange={(e) => setDocEntities(e.target.value)}
                            placeholder="Alice, Google, ML model"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            {tAddDocument("entitiesHelpText")}
                          </p>
                        </div>
                      </TabsContent>
                    </div>
                  </Tabs>
                </div>
              )}
            </div>

            {features?.store_document_text === false && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{tAddDocument("textNotStoredWarning")}</span>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setDocDialogOpen(false);
                  setDocContent("");
                  setDocBlocks([]);
                  setDocComposeMode("text");
                  setDocContext("");
                  setDocEventDate("");
                  setDocDocumentId("");
                  setDocTags("");
                  setDocObservationScopes("combined");
                  setDocObservationScopesCustom("");
                  setDocMetadata("");
                  setDocEntities("");
                  setDocAdvancedTab("document");
                  setDocAsync(false);
                  setSelectedFiles([]);
                  setFilesMetadata([]);
                  setUploadProgress("");
                }}
              >
                {tAddDocument("cancel")}
              </Button>
              {docTab === "text" ? (
                <Button
                  onClick={handleCreateDocument}
                  disabled={
                    isCreatingDoc ||
                    (docComposeMode === "blocks"
                      ? !docBlocks.some((b) =>
                          b.kind === "text" ? b.text.trim().length > 0 : true
                        )
                      : !docContent.trim())
                  }
                >
                  {isCreatingDoc
                    ? tAddDocument("addingDocument")
                    : tAddDocument("addDocumentSubmit")}
                </Button>
              ) : (
                <Button
                  onClick={handleUploadFiles}
                  disabled={isCreatingDoc || selectedFiles.length === 0}
                >
                  {isCreatingDoc
                    ? uploadProgress || tAddDocument("uploading")
                    : tAddDocument("uploadFiles", { count: selectedFiles.length })}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export function BankSelector() {
  return (
    <Suspense
      fallback={
        <div className="bg-card text-card-foreground px-5 py-3 border-b-4 border-primary-gradient">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm">
            <Image
              src={withBasePath("/logo.png")}
              alt="Hindsight"
              width={40}
              height={40}
              className="h-10 w-auto"
              unoptimized
            />
            <div className="h-8 w-px bg-border" />
            <Button
              variant="outline"
              className="w-[250px] justify-between font-bold border-2 border-primary"
              disabled
            >
              Loading...
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
            <div className="flex-1" />
            <a
              href="https://github.com/vectorize-io/hindsight"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
            >
              <Github className="h-5 w-5" />
              <span className="text-sm font-medium">GitHub</span>
            </a>
            <div className="h-8 w-px bg-border" />
            <Button variant="ghost" size="icon" className="h-9 w-9" disabled>
              <Moon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      }
    >
      <BankSelectorInner />
    </Suspense>
  );
}
