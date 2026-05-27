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
      <main className="flex-1 md:pl-60 pt-14 md:pt-0 flex flex-col min-h-screen w-0 min-w-0">
        {children}
      </main>
      <Toaster />
    </div>
  );
}
