import { Header } from "@/components/layout/header";
import { UploadZone } from "@/components/upload/upload-zone";
import { UploadsList } from "@/components/upload/uploads-list";

export const metadata = { title: "Uploads" };

export default function UploadsPage() {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Upload Center"
        description="Upload files to extract and process contact data"
      />
      <div className="flex-1 p-6 space-y-6 animate-fade-in">
        <UploadZone />
        <UploadsList />
      </div>
    </div>
  );
}
