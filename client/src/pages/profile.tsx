import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { User, Key, Monitor, Trash2, Loader2, Download, FileText, Database } from 'lucide-react';

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActivity: string;
  expiresAt: string;
  createdAt: string;
}

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const { toast } = useToast();
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data: sessions, isLoading: sessionsLoading, isError: sessionsError } = useQuery<Session[]>({
    queryKey: ['/api/auth/sessions'],
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string }) => {
      const response = await apiRequest('PATCH', '/api/users/profile/me', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update profile');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Profile updated',
        description: 'Your profile has been updated successfully',
      });
      refreshUser();
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update profile',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest('POST', '/api/auth/change-password', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to change password');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Password changed',
        description: 'Your password has been changed. Please log in again.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => logout(), 2000);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to change password',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest('DELETE', `/api/auth/sessions/${sessionId}`, undefined);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete session');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Session deleted',
        description: 'Session has been terminated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/sessions'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete session',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleUpdateProfile = () => {
    updateProfileMutation.mutate({ firstName, lastName });
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please ensure both passwords are the same',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      });
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-[600px]">
          <TabsTrigger value="profile" data-testid="tab-profile">
            <User className="mr-2 h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="password" data-testid="tab-password">
            <Key className="mr-2 h-4 w-4" />
            Password
          </TabsTrigger>
          <TabsTrigger value="sessions" data-testid="tab-sessions">
            <Monitor className="mr-2 h-4 w-4" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="data" data-testid="tab-data-export">
            <Download className="mr-2 h-4 w-4" />
            Data Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your personal information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={user?.email || ''}
                  disabled
                  className="bg-muted"
                  data-testid="input-email-readonly"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex items-center gap-2">
                  <Badge variant={user?.role === 'admin' ? 'default' : 'secondary'}>
                    {user?.role}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <Button
                onClick={handleUpdateProfile}
                disabled={updateProfileMutation.isPending}
                data-testid="button-update-profile"
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Profile'
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  data-testid="input-current-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  data-testid="input-new-password"
                />
                {newPassword.length > 0 && newPassword.length < 8 && (
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 8 characters
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  data-testid="input-confirm-password"
                />
                {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">
                    Passwords do not match
                  </p>
                )}
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={
                  changePasswordMutation.isPending ||
                  !currentPassword ||
                  !newPassword ||
                  newPassword !== confirmPassword ||
                  newPassword.length < 8
                }
                data-testid="button-change-password"
              >
                {changePasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  'Change Password'
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Sessions</CardTitle>
              <CardDescription>
                Manage your active sessions across different devices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : sessionsError ? (
                <Alert variant="destructive">
                  <AlertDescription>Failed to load sessions. Please try again.</AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions && sessions.length > 0 ? (
                      sessions.map((session) => (
                        <TableRow key={session.id} data-testid={`row-session-${session.id}`}>
                          <TableCell className="font-medium">
                            {session.userAgent?.includes('Chrome')
                              ? 'Chrome'
                              : session.userAgent?.includes('Firefox')
                              ? 'Firefox'
                              : session.userAgent?.includes('Safari')
                              ? 'Safari'
                              : 'Unknown Browser'}
                          </TableCell>
                          <TableCell>{session.ipAddress || 'Unknown'}</TableCell>
                          <TableCell>
                            {new Date(session.lastActivity).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteSessionMutation.mutate(session.id)}
                              data-testid={`button-delete-session-${session.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No active sessions
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Export Your Data</CardTitle>
              <CardDescription>
                Download your data in CSV or JSON format for backup, analysis, or GDPR compliance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Prospects Export */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Prospects</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Export all your prospect data including contact details, enrichment data, and custom fields
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/api/export/prospects/csv', '_blank')}
                    data-testid="button-export-prospects-csv"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/api/export/prospects/json', '_blank')}
                    data-testid="button-export-prospects-json"
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Download JSON
                  </Button>
                </div>
              </div>

              <div className="border-t" />

              {/* Sequences Export */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Sequences</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Export your email sequences including all steps and templates
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/api/export/sequences/csv', '_blank')}
                    data-testid="button-export-sequences-csv"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/api/export/sequences/json', '_blank')}
                    data-testid="button-export-sequences-json"
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Download JSON
                  </Button>
                </div>
              </div>

              <div className="border-t" />

              {/* Email Activity Export */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Email Activity</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Export email sending logs including delivery status and timestamps
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/api/export/emails/csv', '_blank')}
                    data-testid="button-export-emails-csv"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                </div>
              </div>

              <div className="border-t" />

              {/* Email Replies Export */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Email Replies</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Export all received email replies and their sentiment analysis
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/api/export/replies/csv', '_blank')}
                    data-testid="button-export-replies-csv"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                </div>
              </div>

              <div className="border-t" />

              {/* Analytics Export */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Search History & Analytics</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Export your search history and analytics data
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('/api/export/analytics/csv', '_blank')}
                    data-testid="button-export-analytics-csv"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Download CSV
                  </Button>
                </div>
              </div>

              <div className="border-t" />

              {/* Full Account Export */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Complete Account Data</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Download all your data in a single JSON file (GDPR complete export)
                </p>
                <Button
                  variant="default"
                  onClick={() => window.open('/api/export/account/full', '_blank')}
                  data-testid="button-export-account-full"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Complete Export
                </Button>
              </div>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>GDPR Compliance:</strong> You have the right to access, export, and delete your personal data. 
                  These exports contain all data associated with your account. For data deletion requests, please contact support.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
