import { PracticeWorkbench } from '@/components/practice-workbench';
export default async function WorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return <PracticeWorkbench id={id} />;
}
