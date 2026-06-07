import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminUser } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminUser();

  return (
    <div className="min-w-0 space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
