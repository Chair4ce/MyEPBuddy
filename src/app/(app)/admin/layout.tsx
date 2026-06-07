import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/admin-nav";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <AdminNav />
      {children}
    </div>
  );
}
