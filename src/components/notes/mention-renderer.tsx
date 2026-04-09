import { collection, getDocs } from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';

interface MentionTextProps {
  text: string;
  profile: UserProfile | null;
  isAdmin: boolean;
  toast: (opts: { variant?: 'destructive'; title: string; description?: string; duration?: number }) => void;
  onClosePanel: () => void;
}

export function MentionText({ text, profile, isAdmin, toast, onClosePanel }: MentionTextProps) {
  async function handleMentionClick(e: React.MouseEvent, url: string, clientId: string | undefined) {
    e.preventDefault();

    // Close the notes panel before navigating
    onClosePanel();

    // Parse URL and hash
    const hashIdx = url.indexOf('#');
    const basePath = hashIdx >= 0 ? url.substring(0, hashIdx) : url;
    const hash = hashIdx >= 0 ? url.substring(hashIdx) : '';

    // Navigate helper — handles both same-page and cross-page navigation
    function navigateTo() {
      const currentPath = window.location.pathname;
      if (currentPath === basePath && hash) {
        // Same page, different tab — just update the hash (triggers hashchange)
        window.location.hash = hash;
        // Force re-read by dispatching hashchange event
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } else {
        // Different page — full navigation with hash
        window.location.href = basePath + hash;
      }
    }

    // If no clientId, navigate directly (no access check needed for suppliers etc.)
    if (!clientId) {
      navigateTo();
      return;
    }

    // Check if user has access to this client
    const userClientIds = profile?.clientIds || [];

    if (isAdmin || userClientIds.includes(clientId)) {
      navigateTo();
      return;
    }

    // User doesn't have access — find admins for this client
    try {
      const profilesSnap = await getDocs(collection(db, 'profiles'));
      const admins = profilesSnap.docs
        .map(d => d.data())
        .filter(p => p.role === 'admin')
        .map(p => p.name || p.email)
        .filter(Boolean)
        .slice(0, 3);

      const contactList = admins.length > 0
        ? admins.join(', ')
        : 'your administrator';

      toast({
        variant: 'destructive',
        title: 'Access Denied',
        description: `You don't have access to this resource. Contact ${contactList} to request access.`,
        duration: 8000,
      });
    } catch (err) {
      console.error('[notes] access check failed:', err);
      toast({
        variant: 'destructive',
        title: 'Access Denied',
        description: 'You don\'t have access to this resource. Contact your administrator.',
      });
    }
  }

  // Pattern: @[Display Text](url) or @[Display Text](url|clientId:xxx)
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const displayText = match[1];
    const fullUrl = match[2];
    const urlParts = fullUrl.split('|');
    const url = urlParts[0];
    const clientId = urlParts.find(p => p.startsWith('clientId:'))?.replace('clientId:', '') || undefined;

    parts.push(
      <a
        key={match.index}
        href={url}
        className="text-primary hover:underline font-medium cursor-pointer"
        onClick={(e) => handleMentionClick(e, url, clientId)}
      >
        @{displayText}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
}
