import { useRoute } from "wouter";
import { ProductionSequenceBuilder } from "./ProductionSequenceBuilder";
import { SequencesList } from "./SequencesList";

export default function SequencesPage() {
  const [match, params] = useRoute("/sequences/:id");
  const sequenceId = params?.id;

  if (match && sequenceId) {
    return <ProductionSequenceBuilder sequenceId={sequenceId} />;
  }

  return <SequencesList />;
}
