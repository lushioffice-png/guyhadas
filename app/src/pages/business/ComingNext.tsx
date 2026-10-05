import { EmptyState } from "../../components/EmptyState";

interface ComingNextProps {
  title: string;
  description: string;
}

export default function ComingNext({ title, description }: ComingNextProps) {
  return (
    <div className="section-block">
      <h2 className="section-title">{title}</h2>
      <EmptyState title="בקרוב" subtitle={description} />
    </div>
  );
}
