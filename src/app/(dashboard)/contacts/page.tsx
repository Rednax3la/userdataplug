import { Header } from "@/components/layout/header";
import { ContactsTable } from "@/components/contacts/contacts-table";

export const metadata = { title: "Contacts" };

export default function ContactsPage() {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Contacts"
        description="All extracted and enriched contact records"
      />
      <div className="flex-1 p-6 animate-fade-in">
        <ContactsTable />
      </div>
    </div>
  );
}
