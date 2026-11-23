import { TeacherShell } from "@/components/TeacherShell";

export default async function ExamsLayout({ children }: { children: React.ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}
