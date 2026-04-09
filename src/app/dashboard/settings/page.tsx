import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Users, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { db } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import { logAudit } from '@/lib/audit';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const { profile, user, updateProfileName } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setPosition(profile.position || '');
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await db.users.update(user.uid, {
        displayName: name,
      });
      updateProfileName(name);
      logAudit({ action: 'profile.updated', category: 'user', targetCollection: 'users', targetDocId: user.uid, details: { name, position } });
      toast({
        title: "Success",
        description: "Your profile has been updated.",
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update profile.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-2">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-3">
               <Avatar className="h-10 w-10 border-2 border-primary/20">
                  <AvatarImage src={profile?.photoURL || ''} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {profile?.name?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                User Profile
            </CardTitle>
            <CardDescription className="text-xs">Manage your personal information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={user?.email || ''} disabled readOnly className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Position</Label>
                <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
            <Button className="w-full" onClick={handleUpdateProfile} disabled={loading}>
              {loading ? 'Saving...' : 'Update Profile'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Management
            </CardTitle>
            <CardDescription className="text-xs">
              Manage team members, roles, and client access permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Control which clients your team members can see and define their editing permissions.
            </p>
            <Link to="/dashboard/settings/users">
              <Button variant="outline" className="w-full gap-2 group">
                Go to User Management
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
