"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LEDGER_PAGE_SIZE } from "@/lib/billing/constants";
import type { CreditTransaction } from "@/stores/credits-store";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface LedgerPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

interface CreditLedgerTableProps {
  /** Bump to reload page 1 (e.g. after a successful purchase). */
  refreshKey?: number;
}

function formatTransactionType(type: string): string {
  switch (type) {
    case "trial":
      return "Trial grant";
    case "purchase":
      return "Purchase";
    case "consume":
      return "Used";
    case "refund":
      return "Refund";
    case "adjustment":
      return "Adjustment";
    case "bonus":
      return "Earn bonus";
    default:
      return type;
  }
}

export function CreditLedgerTable({ refreshKey = 0 }: CreditLedgerTableProps) {
  const [page, setPage] = useState(1);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [pagination, setPagination] = useState<LedgerPagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastRefreshKey = useRef(refreshKey);

  const loadPage = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/billing/ledger?page=${targetPage}&pageSize=${LEDGER_PAGE_SIZE}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to load ledger");
      }

      setTransactions(data.transactions ?? []);
      setPagination(data.pagination ?? null);
      setPage(data.pagination?.page ?? targetPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load ledger");
      setTransactions([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lastRefreshKey.current !== refreshKey) {
      lastRefreshKey.current = refreshKey;
      setPage(1);
      void loadPage(1);
      return;
    }

    void loadPage(page);
  }, [page, refreshKey, loadPage]);

  const goToPrevious = () => {
    if (pagination?.hasPrevious) {
      setPage((current) => Math.max(1, current - 1));
    }
  };

  const goToNext = () => {
    if (pagination?.hasNext) {
      setPage((current) => current + 1);
    }
  };

  const rangeStart =
    pagination && pagination.totalCount > 0
      ? (pagination.page - 1) * pagination.pageSize + 1
      : 0;
  const rangeEnd =
    pagination && pagination.totalCount > 0
      ? Math.min(pagination.page * pagination.pageSize, pagination.totalCount)
      : 0;

  if (loading && transactions.length === 0) {
    return (
      <div
        className="flex min-h-[120px] items-center justify-center text-muted-foreground"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="size-4 animate-spin mr-2" />
        Loading activity...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadPage(page)}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!pagination || pagination.totalCount === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto min-h-[120px]">
        <Table aria-label="Token ledger">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <Loader2
                    className="size-4 animate-spin mx-auto text-muted-foreground"
                    aria-label="Loading page"
                  />
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(tx.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {tx.description || formatTransactionType(tx.type)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      tx.amount > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tx.balance_after}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums">
            Showing {rangeStart}–{rangeEnd} of {pagination.totalCount}
          </p>
          <nav
            className="flex items-center gap-2"
            aria-label="Token ledger pagination"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goToPrevious}
              disabled={!pagination.hasPrevious || loading}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm tabular-nums px-1 min-w-[88px] text-center">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goToNext}
              disabled={!pagination.hasNext || loading}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="size-4 ml-1" />
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}
