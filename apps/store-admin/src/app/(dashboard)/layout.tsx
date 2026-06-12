import {
  AdminSidebar,
  AdminHeader,
  AdminShellGuard,
} from "@/widgets/admin-shell";

/**
 * Layout for the authenticated admin area. AdminShellGuard gates access —
 * only a signed-in ADMIN reaches the sidebar/header chrome and nested pages.
 */
export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AdminShellGuard>
      <div className="flex h-screen overflow-hidden">
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AdminHeader />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AdminShellGuard>
  );
}
