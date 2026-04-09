import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  query,
  addDoc,
  deleteDoc,
  getDocs,
  where,
  serverTimestamp
} from '@/lib/firestore-compat';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MultiSelect } from '@/components/ui/multi-select';
import { useToast } from '@/hooks/use-toast';
import { Shield, UserCog, Clock, Briefcase, Mail, UserPlus, Trash2, Send } from 'lucide-react';
import type { UserProfile, Client } from '@/types';
import { logAudit } from '@/lib/audit';

interface Invite {
  id: string;
  email: string;
  role: string;
  clientIds: string[];
  invitedBy: string;
  invitedAt: any;
  status: string;
}

export default function UserManagementPage() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviteClientIds, setInviteClientIds] = useState<string[]>([]);
  const [inviteSending, setInviteSending] = useState(false);

  // Pending invites
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);

  useEffect(() => {
    // Fetch profiles
    const unsubProfiles = onSnapshot(collection(db, 'profiles'), (split) => {
      setProfiles(split.docs.map(d => ({ ...d.data() } as UserProfile)));
      setLoading(false);
    });

    // Fetch clients for multi-select
    const unsubClients = onSnapshot(collection(db, 'clients'), (split) => {
      setClients(split.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });

    // Fetch pending invites
    const unsubInvites = onSnapshot(
      query(collection(db, 'invites'), where('status', '==', 'pending')),
      (snap) => {
        setPendingInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite)));
      }
    );

    return () => {
      unsubProfiles();
      unsubClients();
      unsubInvites();
    };
  }, []);

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Email is required.' });
      return;
    }

    setInviteSending(true);
    try {
      // Check if invite already exists for this email
      const existingSnap = await getDocs(
        query(collection(db, 'invites'), where('email', '==', inviteEmail.trim().toLowerCase()))
      );

      if (!existingSnap.empty) {
        const existing = existingSnap.docs[0].data();
        if (existing.status === 'pending') {
          toast({ title: 'Already invited', description: 'Invite already sent to this email.' });
          setInviteSending(false);
          return;
        }
        if (existing.status === 'accepted') {
          toast({ title: 'Already registered', description: 'User already registered with this email.' });
          setInviteSending(false);
          return;
        }
      }

      const docRef = await addDoc(collection(db, 'invites'), {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        clientIds: inviteClientIds,
        invitedBy: user?.uid,
        invitedAt: serverTimestamp(),
        status: 'pending',
      });

      logAudit({
        action: 'user.invited',
        category: 'user',
        targetCollection: 'invites',
        targetDocId: docRef.id,
        details: { email: inviteEmail.trim().toLowerCase(), role: inviteRole },
      });

      toast({ title: 'Invite sent', description: `Invitation sent to ${inviteEmail}.` });
      setInviteEmail('');
      setInviteRole('viewer');
      setInviteClientIds([]);
    } catch (error) {
      console.error('Error sending invite:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to send invite.' });
    } finally {
      setInviteSending(false);
    }
  };

  const handleRevokeInvite = async (invite: Invite) => {
    try {
      await deleteDoc(doc(db, 'invites', invite.id));
      logAudit({ action: 'user.invite_revoked', category: 'user', targetCollection: 'invites', targetDocId: invite.id, details: { email: invite.email } });
      toast({ title: 'Invite revoked', description: `Revoked invite for ${invite.email}.` });
    } catch (error) {
      console.error('Error revoking invite:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to revoke invite.' });
    }
  };

  const handleUpdateProfile = async (uid: string, data: Partial<UserProfile>) => {
    try {
      const profileRef = doc(db, 'profiles', uid);
      await updateDoc(profileRef, data);
      const user = profiles.find(p => p.uid === uid);
      if (data.role !== undefined) {
        logAudit({ action: 'user.role_changed', category: 'user', targetCollection: 'profiles', targetDocId: uid, details: { newRole: data.role, userName: user?.name || 'unknown' } });
      }
      if (data.clientIds !== undefined) {
        logAudit({ action: 'user.clients_assigned', category: 'user', targetCollection: 'profiles', targetDocId: uid, details: { clientNames: data.clientIds?.map(id => clients.find(c => c.id === id)?.name || id), userName: user?.name || 'unknown' } });
      }
      toast({
        title: "Success",
        description: "User profile updated successfully.",
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update user profile.",
      });
    }
  };

  const clientOptions = clients.map(c => ({
    label: c.name,
    value: c.id
  }));

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage team members, define roles, and assign client access.
        </p>
      </div>

      {/* Invite User */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Invite User
          </CardTitle>
          <CardDescription className="text-xs">
            Send an invitation to a new team member.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="w-[130px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Clients</label>
              <MultiSelect
                options={clientOptions}
                selected={inviteClientIds}
                onChange={setInviteClientIds}
                placeholder="Assign clients..."
                className="h-9 py-0 min-h-9 text-xs"
              />
            </div>
            <Button onClick={handleSendInvite} disabled={inviteSending}>
              <Send className="h-4 w-4 mr-2" />
              {inviteSending ? 'Sending...' : 'Send Invite'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Pending Invites
            </CardTitle>
            <CardDescription className="text-xs">
              Invitations that have not yet been accepted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-xl overflow-hidden bg-card">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="text-sm">{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs capitalize">{invite.role}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {invite.invitedAt
                          ? (invite.invitedAt.toDate
                              ? invite.invitedAt.toDate().toLocaleDateString()
                              : new Date(invite.invitedAt).toLocaleDateString())
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleRevokeInvite(invite)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Registered Users */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Registered Users
          </CardTitle>
          <CardDescription className="text-xs">
            A list of all users who have accessed the system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-xl overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[300px]">User</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="w-[280px]">Assigned Clients</TableHead>
                  <TableHead>Last Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.uid} className="group hover:bg-muted/20 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border">
                          <AvatarImage src={profile.photoURL || ''} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
                            {profile.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{profile.name}</span>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {profile.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 max-w-[150px]">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Input
                          key={`${profile.uid}-${profile.position}`}
                          defaultValue={profile.position || ''}
                          placeholder="Position..."
                          className="h-8 text-xs bg-transparent border-none focus-visible:ring-1 focus-visible:bg-background px-1"
                          onBlur={(e) => {
                            if (e.target.value !== profile.position) {
                              handleUpdateProfile(profile.uid, { position: e.target.value });
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={profile.role || 'viewer'}
                        onValueChange={(val: any) => handleUpdateProfile(profile.uid, { role: val })}
                      >
                        <SelectTrigger className="h-8 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <MultiSelect
                        options={clientOptions}
                        selected={profile.clientIds || []}
                        onChange={(selected) => handleUpdateProfile(profile.uid, { clientIds: selected })}
                        placeholder="Assign clients..."
                        className="h-8 py-0 min-h-8 text-xs"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {profile.lastLogin ? (
                          (profile.lastLogin as any).toDate ?
                          (profile.lastLogin as any).toDate().toLocaleString() :
                          '—'
                        ) : 'Never'}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {profiles.length === 0 && !loading && (
                    <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            No users registered yet.
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
