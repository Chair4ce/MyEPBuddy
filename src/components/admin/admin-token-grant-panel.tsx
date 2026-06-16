"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type AdminGrantCreditsResult,
  type AdminGrantSearchUser,
  formatGrantUserLabel,
  parseGrantAmount,
} from "@/lib/admin/token-grant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Gift, Loader2, Search, UserRound, Users } from "lucide-react";

type GrantTarget = "individual" | "all";

export function AdminTokenGrantPanel() {
  const supabase = createClient();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [target, setTarget] = useState<GrantTarget>("individual");
  const [amountInput, setAmountInput] = useState("10");
  const [note, setNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminGrantSearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminGrantSearchUser | null>(null);
  const [targetCount, setTargetCount] = useState<number | null>(null);
  const [isLoadingTargetCount, setIsLoadingTargetCount] = useState(false);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [isGranting, setIsGranting] = useState(false);

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await (supabase.rpc as Function)("admin_search_users", {
          p_query: trimmed,
          p_limit: 10,
        });

        if (error) {
          toast.error(error.message);
          setSearchResults([]);
          return;
        }

        setSearchResults((data ?? []) as AdminGrantSearchUser[]);
      } catch {
        toast.error("Failed to search users");
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [supabase],
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(() => {
      void runSearch(value);
    }, 300);
  };

  const loadTargetCount = useCallback(async () => {
    setIsLoadingTargetCount(true);
    try {
      const { data, error } = await (supabase.rpc as Function)("admin_grant_target_count");
      if (error) {
        toast.error(error.message);
        return null;
      }
      const count = typeof data === "number" ? data : 0;
      setTargetCount(count);
      return count;
    } catch {
      toast.error("Failed to load user count");
      return null;
    } finally {
      setIsLoadingTargetCount(false);
    }
  }, [supabase]);

  const handleTargetChange = (value: GrantTarget) => {
    setTarget(value);
    if (value === "all" && targetCount === null) {
      void loadTargetCount();
    }
  };

  const resetGrantForm = () => {
    setNote("");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedUser(null);
  };

  const grantToIndividual = async (amount: number) => {
    if (!selectedUser) {
      toast.error("Select a user to grant tokens.");
      return;
    }

    setIsGranting(true);
    try {
      const { data, error } = await (supabase.rpc as Function)("admin_grant_credits", {
        p_user_ids: [selectedUser.id],
        p_amount: amount,
        p_note: note.trim() || null,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      const result = data as AdminGrantCreditsResult;
      const newBalance = result.users?.[0]?.new_balance;

      toast.success(
        `Granted ${amount} tokens to ${formatGrantUserLabel(selectedUser)}${
          typeof newBalance === "number" ? ` (new balance: ${newBalance})` : ""
        }.`,
      );
      resetGrantForm();
    } catch {
      toast.error("Failed to grant tokens");
    } finally {
      setIsGranting(false);
    }
  };

  const grantToAll = async (amount: number) => {
    setIsGranting(true);
    try {
      const { data, error } = await (supabase.rpc as Function)("admin_grant_credits_all", {
        p_amount: amount,
        p_note: note.trim() || null,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      const result = data as AdminGrantCreditsResult;
      toast.success(
        `Granted ${amount} tokens to ${result.granted_count} users (${result.total_tokens} total).`,
      );
      resetGrantForm();
      setConfirmAllOpen(false);
    } catch {
      toast.error("Failed to grant tokens to all users");
    } finally {
      setIsGranting(false);
    }
  };

  const handleGrantClick = async () => {
    const amount = parseGrantAmount(amountInput);
    if (amount === null) {
      toast.error("Enter a whole number between 1 and 10,000.");
      return;
    }

    if (target === "individual") {
      await grantToIndividual(amount);
      return;
    }

    const count = targetCount ?? (await loadTargetCount());
    if (count === null) {
      return;
    }
    setConfirmAllOpen(true);
  };

  const handleConfirmAllGrant = async () => {
    const amount = parseGrantAmount(amountInput);
    if (amount === null) {
      toast.error("Enter a whole number between 1 and 10,000.");
      setConfirmAllOpen(false);
      return;
    }

    await grantToAll(amount);
  };

  const parsedAmount = parseGrantAmount(amountInput);
  const totalTokensForAll =
    parsedAmount !== null && targetCount !== null ? parsedAmount * targetCount : null;

  return (
    <div className="space-y-4">
      <Separator />
      <div className="space-y-1">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Gift className="size-4" aria-hidden />
          Grant tokens
        </h3>
        <p className="text-xs text-muted-foreground">
          Add tokens to existing balances. Grants are recorded as adjustment entries in each
          user&apos;s ledger.
        </p>
      </div>

      <RadioGroup
        value={target}
        onValueChange={(value) => handleTargetChange(value as GrantTarget)}
        className="grid gap-3 sm:grid-cols-2"
        aria-label="Grant target"
      >
        <label
          htmlFor="grant-target-individual"
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
            target === "individual"
              ? "border-primary bg-primary/5"
              : "bg-muted/30 hover:bg-muted/50",
          )}
        >
          <RadioGroupItem
            value="individual"
            id="grant-target-individual"
            aria-label="Grant to individual user"
          />
          <div className="space-y-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <UserRound className="size-4" aria-hidden />
              Individual user
            </span>
            <p className="text-xs text-muted-foreground">
              Search by email or name and grant to one account.
            </p>
          </div>
        </label>

        <label
          htmlFor="grant-target-all"
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
            target === "all"
              ? "border-primary bg-primary/5"
              : "bg-muted/30 hover:bg-muted/50",
          )}
        >
          <RadioGroupItem
            value="all"
            id="grant-target-all"
            aria-label="Grant to all users"
          />
          <div className="space-y-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4" aria-hidden />
              All users
            </span>
            <p className="text-xs text-muted-foreground">
              Grant the same amount to every profile in the system.
            </p>
          </div>
        </label>
      </RadioGroup>

      {target === "individual" ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div className="space-y-2">
            <Label htmlFor="grant-user-search">Find user</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="grant-user-search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by email or name"
                aria-label="Search users for token grant"
                className="pl-9"
                autoComplete="off"
              />
            </div>
          </div>

          {selectedUser ? (
            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {formatGrantUserLabel(selectedUser)}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Current balance: {selectedUser.balance} tokens
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUser(null)}
                aria-label="Clear selected user"
              >
                Change
              </Button>
            </div>
          ) : (
            <div className="rounded-md border bg-background">
              {isSearching ? (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Searching...
                </div>
              ) : searchQuery.trim().length < 2 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </p>
              ) : searchResults.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No users matched that search.
                </p>
              ) : (
                <ul className="divide-y" role="listbox" aria-label="User search results">
                  {searchResults.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        role="option"
                        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          setSelectedUser(user);
                          setSearchResults([]);
                          setSearchQuery("");
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {formatGrantUserLabel(user)}
                          </span>
                          {user.rank ? (
                            <span className="text-xs text-muted-foreground">{user.rank}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {user.balance} tokens
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          {isLoadingTargetCount ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading user count...
            </span>
          ) : (
            <span>
              This will grant tokens to{" "}
              <strong className="font-medium text-foreground">
                {targetCount ?? "all"}
              </strong>{" "}
              accounts.
              {totalTokensForAll !== null ? (
                <>
                  {" "}
                  Total tokens issued:{" "}
                  <strong className="font-medium text-foreground tabular-nums">
                    {totalTokensForAll.toLocaleString()}
                  </strong>
                  .
                </>
              ) : null}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="grant-amount">Tokens to grant</Label>
          <Input
            id="grant-amount"
            type="number"
            min={1}
            max={10000}
            inputMode="numeric"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            aria-label="Number of tokens to grant"
            className="tabular-nums"
          />
          <p className="text-xs text-muted-foreground">Between 1 and 10,000 per user.</p>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="grant-note">Note (optional)</Label>
          <Textarea
            id="grant-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for grant (stored in the credit ledger)"
            aria-label="Optional note for token grant"
            rows={2}
            maxLength={500}
          />
        </div>
      </div>

      <Button
        type="button"
        onClick={() => void handleGrantClick()}
        disabled={
          isGranting ||
          parsedAmount === null ||
          (target === "individual" && !selectedUser) ||
          (target === "all" && isLoadingTargetCount)
        }
      >
        {isGranting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <Gift className="size-4" aria-hidden />
            {target === "all" ? "Review grant to all users" : "Grant tokens"}
          </>
        )}
      </Button>

      <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grant tokens to all users?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  You are about to grant{" "}
                  <strong className="text-foreground tabular-nums">
                    {parsedAmount ?? 0}
                  </strong>{" "}
                  tokens to{" "}
                  <strong className="text-foreground tabular-nums">
                    {targetCount ?? 0}
                  </strong>{" "}
                  accounts.
                </p>
                {totalTokensForAll !== null ? (
                  <p>
                    Total tokens issued:{" "}
                    <strong className="text-foreground tabular-nums">
                      {totalTokensForAll.toLocaleString()}
                    </strong>
                    .
                  </p>
                ) : null}
                <p>This action cannot be undone automatically.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isGranting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isGranting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmAllGrant();
              }}
            >
              {isGranting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Confirm grant"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
