import { BoardView } from "@/components/BoardView";

type PageProps = {
  params: Promise<{ boardId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { boardId } = await params;
  return <BoardView boardId={Number(boardId)} />;
}

