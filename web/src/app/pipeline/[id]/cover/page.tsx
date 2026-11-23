import { findApplication } from "@/lib/career-ops";
import { companyPresentation } from "@/lib/company-presentation.mjs";
import { CoverStudio } from "@/components/cover-studio";

export const dynamic = "force-dynamic";

export default async function CoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = findApplication(id);
  const company = app ? companyPresentation(app).label : `#${id}`;
  return <CoverStudio n={id} company={company} />;
}
