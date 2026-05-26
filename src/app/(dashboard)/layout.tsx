import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/toaster";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 pl-60 flex flex-col min-h-screen">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
