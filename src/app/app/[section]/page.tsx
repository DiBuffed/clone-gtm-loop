import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
const sections = ["overview", "content", "calendar", "profile", "settings"];
export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <Workspace section={section} mode="customer" />;
}
