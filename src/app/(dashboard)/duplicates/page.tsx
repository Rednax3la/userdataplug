import { Header } from "@/components/layout/header";
import { DuplicatesReview } from "@/components/duplicates/duplicates-review";

export const metadata = { title: "Duplicates" };

export default function DuplicatesPage() {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Duplicate Review"
        description="Review and resolve potential duplicate records"
      />
      <div className="flex-1 p-6 animate-fade-in">
        <DuplicatesReview />
      </div>
    </div>
  );
}
