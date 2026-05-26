import { Header } from "@/components/layout/header";
import { ExportPanel } from "@/components/export/export-panel";

export const metadata = { title: "Export" };

export default function ExportPage() {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Export Data"
        description="Download your contacts in multiple formats"
      />
      <div className="flex-1 p-6 animate-fade-in">
        <ExportPanel />
      </div>
    </div>
  );
}
