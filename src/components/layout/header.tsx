import { createClient } from "@/lib/supabase/server";
import { getInitials } from "@/lib/utils";

interface HeaderProps {
  title: string;
  description?: string;
}

export async function Header({ title, description }: HeaderProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const initials = getInitials(user?.email ?? "U");

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div>
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold select-none">
          {initials}
        </div>
      </div>
    </header>
  );
}
