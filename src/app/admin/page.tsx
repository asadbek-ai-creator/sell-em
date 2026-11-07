"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Sparkles,
  Trophy,
  Upload,
} from "lucide-react";

import {
  getProducts,
  uploadProductsFromCSV,
  type ProductInput,
} from "@/app/actions/admin";
import { generateProductPitch } from "@/app/actions/ai";
import { resetDailyTask } from "@/app/actions/tasks";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/i18n/LanguageContext";

type Product = Awaited<ReturnType<typeof getProducts>>[number];
type Status = { type: "success" | "error"; message: string } | null;

const REQUIRED_HEADERS = ["name", "brand", "sizeRange"] as const;

// Inlined at build time; the server action enforces the same rule.
const SHOW_DEV_TOOLS =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";

class MissingColumnsError extends Error {
  constructor(public columns: string[]) {
    super(`Missing columns: ${columns.join(", ")}`);
  }
}

function parseCsv(file: File): Promise<ProductInput[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: ({ data, meta }) => {
        const fields = meta.fields ?? [];
        const missing = REQUIRED_HEADERS.filter((h) => !fields.includes(h));
        if (missing.length > 0) {
          reject(new MissingColumnsError(missing));
          return;
        }
        resolve(
          data.map((row) => ({
            name: row.name?.trim() ?? "",
            brand: row.brand?.trim() ?? "",
            sizeRange: row.sizeRange?.trim() ?? "",
          })),
        );
      },
      error: (err) => reject(err),
    });
  });
}

export default function AdminPage() {
  const { t, locale, formatDate, formatNumber } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<Status>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshProducts = useCallback(() => {
    return getProducts()
      .then((list) => {
        setProducts(list);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setIsLoadingProducts(false));
  }, []);

  useEffect(() => {
    refreshProducts();
  }, [refreshProducts]);

  async function handleGeneratePitch(productId: string) {
    setPitchError(null);
    setGeneratingIds((prev) => new Set(prev).add(productId));

    try {
      // The pitch is written in the admin's currently selected language.
      const result = await generateProductPitch(productId, locale);
      if (!result.success) {
        setPitchError(t(`errors.${result.error}`));
        return;
      }
      await refreshProducts();
    } catch {
      setPitchError(t("errors.unknown"));
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  }

  async function handleResetDailyTask() {
    setIsResetting(true);
    setResetStatus(null);
    try {
      const result = await resetDailyTask();
      setResetStatus(
        result.success
          ? {
              type: "success",
              message:
                result.deleted > 0
                  ? t("admin.resetDone")
                  : t("admin.resetNothing"),
            }
          : { type: "error", message: t(`errors.${result.error}`) },
      );
    } catch {
      setResetStatus({ type: "error", message: t("errors.unknown") });
    } finally {
      setIsResetting(false);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setIsUploading(true);
    setStatus(null);

    try {
      const rows = await parseCsv(file);
      const valid = rows.filter((r) => r.name && r.brand && r.sizeRange);
      if (valid.length === 0) {
        setStatus({ type: "error", message: t("admin.noCompleteRows") });
        return;
      }

      const result = await uploadProductsFromCSV(valid);
      if (!result.success) {
        setStatus({ type: "error", message: t(`errors.${result.error}`) });
        return;
      }

      const skipped = rows.length - valid.length + result.skipped;
      setStatus({
        type: "success",
        message: [
          t("admin.importSuccess", { count: formatNumber(result.inserted) }),
          skipped > 0
            ? t("admin.importSkipped", { count: formatNumber(skipped) })
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshProducts();
    } catch (err) {
      setStatus({
        type: "error",
        message:
          err instanceof MissingColumnsError
            ? t("admin.missingColumns", { columns: err.columns.join(", ") })
            : t("admin.uploadFailed"),
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("admin.title")}
          </h1>
          <p className="text-muted-foreground">{t("admin.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher className="h-9" />
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-400/10 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-400/20 dark:text-amber-300"
          >
            <Trophy className="size-4" />
            {t("nav.viewLeaderboard")}
          </Link>
        </div>
      </div>

      {SHOW_DEV_TOOLS && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-orange-500/50 bg-orange-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-orange-700 dark:text-orange-300">
              {t("admin.devTools")}
            </p>
            {resetStatus && (
              <p
                role="status"
                className={
                  resetStatus.type === "success"
                    ? "text-green-600"
                    : "text-destructive"
                }
              >
                {resetStatus.message}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetDailyTask}
            disabled={isResetting}
            className="shrink-0"
          >
            {isResetting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            {isResetting ? t("admin.resetting") : t("admin.resetTraining")}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            {t("admin.uploadTitle")}
          </CardTitle>
          <CardDescription>{t("admin.uploadDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setStatus(null);
              }}
              disabled={isUploading}
              className="cursor-pointer"
            />
            <Button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="sm:min-w-40"
            >
              {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {isUploading ? t("admin.uploading") : t("admin.uploadButton")}
            </Button>
          </div>

          <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                {t("admin.csvFormatTitle")}
              </span>{" "}
              {t("admin.csvFormatBody")}{" "}
              <code className="font-mono">name</code>,{" "}
              <code className="font-mono">brand</code>,{" "}
              <code className="font-mono">sizeRange</code>.
            </p>
            <pre className="mt-2 overflow-x-auto font-mono text-xs">
              {`name,brand,sizeRange
Air Max 90,Nike,36-45
Ultraboost 22,Adidas,38-46`}
            </pre>
          </div>

          {status && (
            <p
              role="status"
              className={
                status.type === "success"
                  ? "text-sm text-green-600"
                  : "text-sm text-destructive"
              }
            >
              {status.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.productsTitle")}</CardTitle>
          <CardDescription>
            {isLoadingProducts
              ? t("common.loading")
              : t("admin.productsCount", {
                  count: formatNumber(products.length),
                })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(pitchError || loadFailed) && (
            <p role="alert" className="text-sm text-destructive">
              {pitchError ?? t("admin.loadFailed")}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.colName")}</TableHead>
                <TableHead>{t("admin.colBrand")}</TableHead>
                <TableHead>{t("admin.colSizeRange")}</TableHead>
                <TableHead>{t("admin.colAiPitch")}</TableHead>
                <TableHead className="text-right">
                  {t("admin.colAdded")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingProducts ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t("admin.noProducts")}
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.brand}</TableCell>
                    <TableCell>{p.sizeRange}</TableCell>
                    <TableCell>
                      {p.aiPitchData !== null ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                          <CheckCircle2 className="size-4" />
                          {t("admin.generated")}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGeneratePitch(p.id)}
                          disabled={generatingIds.has(p.id)}
                        >
                          {generatingIds.has(p.id) ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Sparkles />
                          )}
                          {generatingIds.has(p.id)
                            ? t("admin.generating")
                            : t("admin.generatePitch")}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDate(p.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
