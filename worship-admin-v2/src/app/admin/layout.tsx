import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <><AppHeader mode="admin" />{children}</>;
}
