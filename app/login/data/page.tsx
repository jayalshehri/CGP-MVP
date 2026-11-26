import WorkspaceLogin from "@/components/WorkspaceLogin";

export const metadata = { title: "الدخول إلى مكتب إدارة البيانات | CGP" };

export default function LoginPage() {
  return <WorkspaceLogin workspace="data" />;
}
