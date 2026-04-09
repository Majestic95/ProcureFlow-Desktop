import React, { createContext, useContext, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { UserProfile } from '@/types';
import { db } from '@/lib/db';

/**
 * Local user object — compatible with Firebase User interface.
 * Components reference user.uid, user.email, user.displayName,
 * user.isAnonymous, user.photoURL.
 */
interface LocalUser {
  uid: string;
  email: string;
  displayName: string;
  isAnonymous: boolean;
  photoURL: string | null;
}

interface AuthContextType {
  user: LocalUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  updateProfileName: (name: string) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  updateProfileName: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initLocalAuth() {
      try {
        // Fetch the local user from SQLite
        const users = await db.users.getAll() as Array<{
          id: string;
          email: string;
          displayName: string;
          role: string;
          createdAt: string;
        }>;

        if (users.length === 0) {
          // Should not happen (db.rs creates a default user), but handle gracefully
          console.error('No local user found in database');
          setLoading(false);
          return;
        }

        const localUser = users[0];

        setUser({
          uid: localUser.id,
          email: localUser.email,
          displayName: localUser.displayName || 'Local User',
          isAnonymous: false,
          photoURL: null,
        });

        setProfile({
          uid: localUser.id,
          name: localUser.displayName || 'Local User',
          email: localUser.email,
          photoURL: null,
          role: (localUser.role as 'viewer' | 'editor' | 'admin') || 'admin',
          clientIds: [],
          lastLogin: new Date(),
          createdAt: new Date(localUser.createdAt || Date.now()),
        });
      } catch (error) {
        console.error('Error initializing local auth:', error);
        // In desktop mode, if db isn't ready yet (e.g., running in browser dev),
        // fall back to a hardcoded local user so the UI still renders
        const fallbackUser: LocalUser = {
          uid: 'local-user',
          email: 'local@procureflow.desktop',
          displayName: 'Local User',
          isAnonymous: false,
          photoURL: null,
        };
        setUser(fallbackUser);
        setProfile({
          uid: 'local-user',
          name: 'Local User',
          email: 'local@procureflow.desktop',
          photoURL: null,
          role: 'admin',
          clientIds: [],
          lastLogin: new Date(),
          createdAt: new Date(),
        });
      } finally {
        setLoading(false);
      }
    }

    initLocalAuth();
  }, []);

  const isAdmin = profile?.role === 'admin';

  const updateProfileName = (name: string) => {
    if (profile) {
      setProfile({ ...profile, name });
    }
    if (user) {
      setUser({ ...user, displayName: name });
    }
  };

  const value = { user, profile, loading, isAdmin, updateProfileName };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
