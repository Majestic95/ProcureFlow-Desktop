import PortalClient from '@/components/portal/portal-client';
import { useParams, useSearchParams } from 'react-router-dom';

export default function PortalPage() {
  const { rfpId } = useParams<{ rfpId: string }>();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code') || undefined;

  if (!rfpId) return null;
  return <PortalClient rfpId={rfpId} initialCode={code} />;
}
