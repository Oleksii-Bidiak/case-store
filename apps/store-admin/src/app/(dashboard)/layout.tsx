import { AdminShell, AdminShellGuard } from "@/widgets/admin-shell";

/**
 * Layout for the authenticated admin area. AdminShellGuard gates access — only a
 * signed-in ADMIN reaches the shell chrome and nested pages. AdminShell (client)
 * owns the responsive sidebar/drawer + header + main structure; `children` is a
 * Server Component subtree passed straight through.
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AdminShellGuard>
      <AdminShell>{children}</AdminShell>
    </AdminShellGuard>
  );
}
