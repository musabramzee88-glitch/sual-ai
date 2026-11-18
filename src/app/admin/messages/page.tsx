import { JsonForm } from "@/components/AdminActions";
import { AdminShell, TableWrap, Td, Th } from "@/components/AdminShell";
import { adminCtx } from "@/server/admin/page";
import { listMessages } from "@/server/admin/service";

export default async function Page() {
  const { admin, site, t, L } = await adminCtx("MANAGE_SYSTEM_MESSAGES");
  const msgs = await listMessages();
  return (
    <AdminShell brand={site.brand} t={t} perms={admin.permissions} title={t.messages.title}>
      <TableWrap>
        <thead><tr><Th>{t.messages.key}</Th><Th>{t.messages.locale}</Th><Th>{t.messages.titleField}</Th><Th>{t.messages.body}</Th></tr></thead>
        <tbody>
          {msgs.length === 0 && <tr><Td>{t.common.empty}</Td></tr>}
          {msgs.map((m) => <tr key={m.id}><Td>{t.messages.keys[m.key] ?? m.key}</Td><Td>{m.locale}</Td><Td>{m.title}</Td><Td className="whitespace-pre-wrap">{m.body}</Td></tr>)}
        </tbody>
      </TableWrap>
      <h2 className="mb-3 mt-8 font-semibold">{t.common.save}</h2>
      <JsonForm L={L} method="PUT" url="/api/v1/admin/messages" submit={t.common.save} fields={[
        { name: "key", label: t.messages.key, type: "select", options: Object.entries(t.messages.keys) },
        { name: "locale", label: t.messages.locale, type: "select", options: [["AR", "العربية"], ["EN", "English"]] },
        { name: "title", label: t.messages.titleField }, { name: "body", label: t.messages.body, type: "textarea" },
      ]} />
    </AdminShell>
  );
}
