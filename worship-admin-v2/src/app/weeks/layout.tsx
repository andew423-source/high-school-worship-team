import { AppHeader } from "@/components/app-header";
import { requireGroupStaff } from "@/lib/auth";

export default async function WeeksLayout({ children }: { children: React.ReactNode }) {
  await requireGroupStaff();
  return <><AppHeader mode="staff" />{children}</>;
}
