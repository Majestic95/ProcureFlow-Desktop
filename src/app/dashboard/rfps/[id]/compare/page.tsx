import { ProposalCompareClient } from '@/components/rfps/proposal-compare-client';
import { useParams } from 'react-router-dom';

export default function ProposalComparePage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <ProposalCompareClient rfpId={id} />;
}
