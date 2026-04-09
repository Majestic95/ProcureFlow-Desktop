import { ProposalDetailClient } from '@/components/proposals/proposal-detail-client';
import { useParams } from 'react-router-dom';

export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <ProposalDetailClient proposalId={id} />;
}
