import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  UserPlus, 
  Search, 
  MoreVertical, 
  Trash2, 
  RotateCcw, 
  Loader2, 
  Unlock, 
  ArrowLeft,
  Users,
  Shield,
  UsersRound,
  Upload,
  Key,
  Activity,
  Settings,
  ChevronRight,
  Check,
  X,
  Clock,
  UserCog
} from 'lucide-react';
import { Link } from 'wouter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'admin' | 'user' | 'manager' | 'read_only';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string | null;
  createdAt: string;
  isEnabled?: boolean;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isSystem: boolean;
  isDefault: boolean;
  permissions?: Permission[];
}

interface Permission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  isSystem: boolean;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  parentTeamId: string | null;
  leaderId: string | null;
  memberCount?: number;
  color: string | null;
}

interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

export default function AdminPanel() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('user');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isBulkInviteDialogOpen, setIsBulkInviteDialogOpen] = useState(false);
  const [activityPage, setActivityPage] = useState(1);

  const { data: usersData, isLoading: usersLoading } = useQuery<UsersResponse>({
    queryKey: ['/api/admin/users', { search: searchQuery, status: statusFilter !== 'all' ? statusFilter : undefined, role: roleFilter !== 'all' ? roleFilter : undefined }],
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery<{ roles: Role[] }>({
    queryKey: ['/api/admin/roles'],
    enabled: activeTab === 'roles',
  });

  const { data: permissionsData, isLoading: permissionsLoading } = useQuery<{ permissions: Permission[] }>({
    queryKey: ['/api/admin/permissions'],
    enabled: activeTab === 'roles',
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery<{ teams: Team[] }>({
    queryKey: ['/api/admin/teams'],
    enabled: activeTab === 'teams',
  });

  const { data: activityData, isLoading: activityLoading } = useQuery<{ logs: ActivityLog[]; total: number; page: number; pages: number }>({
    queryKey: ['/api/admin/users/activity-logs', { page: activityPage, limit: 20 }],
    enabled: activeTab === 'activity',
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await apiRequest('POST', '/api/auth/invitations', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send invitation');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Invitation sent', description: `Invitation sent successfully` });
      setInviteEmails('');
      setInviteRole('user');
      setIsInviteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send invitation', description: error.message, variant: 'destructive' });
    },
  });

  const bulkInviteMutation = useMutation({
    mutationFn: async (data: { emails: string[]; role: string }) => {
      const response = await apiRequest('POST', '/api/admin/users/bulk-invite', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send bulk invitations');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: 'Bulk invitations sent', 
        description: `Successfully sent ${data.successful?.length || 0} invitations` 
      });
      setInviteEmails('');
      setInviteRole('user');
      setIsBulkInviteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to send invitations', description: error.message, variant: 'destructive' });
    },
  });

  const toggleUserMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      const endpoint = enabled ? `/api/admin/users/${userId}/enable` : `/api/admin/users/${userId}/disable`;
      const response = await apiRequest('POST', endpoint, {});
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update user');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      toast({ 
        title: variables.enabled ? 'User enabled' : 'User disabled', 
        description: `User has been ${variables.enabled ? 'enabled' : 'disabled'} successfully` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update user', description: error.message, variant: 'destructive' });
    },
  });

  const forcePasswordResetMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('POST', `/api/admin/users/${userId}/force-password-reset`, {});
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to force password reset');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Password reset required', description: 'User will be required to reset their password on next login' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to force password reset', description: error.message, variant: 'destructive' });
    },
  });

  const unlockAccountMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest('POST', '/api/auth/unlock-account', { email });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to unlock account');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Account unlocked', description: 'Account has been unlocked successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to unlock account', description: error.message, variant: 'destructive' });
    },
  });

  const handleSingleInvite = () => {
    if (!inviteEmails) return;
    inviteMutation.mutate({ email: inviteEmails.trim(), role: inviteRole });
  };

  const handleBulkInvite = () => {
    const emails = inviteEmails.split(/[,\n]/).map(e => e.trim()).filter(e => e && e.includes('@'));
    if (emails.length === 0) return;
    if (emails.length > 100) {
      toast({ title: 'Too many emails', description: 'Maximum 100 emails per bulk invite', variant: 'destructive' });
      return;
    }
    bulkInviteMutation.mutate({ emails, role: inviteRole });
  };

  const users = usersData?.users || [];
  const roles = rolesData?.roles || [];
  const permissions = permissionsData?.permissions || [];
  const teams = teamsData?.teams || [];
  const activityLogs = activityData?.logs || [];

  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">User & Access Management</h1>
        </div>
        <p className="text-muted-foreground ml-12">Manage users, roles, permissions, and teams</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4 mb-6">
          <TabsTrigger value="users" className="flex items-center gap-2" data-testid="tab-users">
            <Users className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2" data-testid="tab-roles">
            <Shield className="w-4 h-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="teams" className="flex items-center gap-2" data-testid="tab-teams">
            <UsersRound className="w-4 h-4" />
            Teams
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2" data-testid="tab-activity">
            <Activity className="w-4 h-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-users"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-role-filter">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="read_only">Read Only</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-invite-user">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite New User</DialogTitle>
                  <DialogDescription>
                    Send an invitation to a new user to join the platform
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                      data-testid="input-invite-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger data-testid="select-invite-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="read_only">Read Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleSingleInvite}
                    disabled={!inviteEmails || inviteMutation.isPending}
                    className="w-full"
                    data-testid="button-send-invitation"
                  >
                    {inviteMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Invitation'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isBulkInviteDialogOpen} onOpenChange={setIsBulkInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-bulk-invite">
                  <Upload className="mr-2 h-4 w-4" />
                  Bulk Invite
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Bulk Invite Users</DialogTitle>
                  <DialogDescription>
                    Invite multiple users at once (up to 100). Enter one email per line or separate with commas.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="bulk-emails">Email Addresses</Label>
                    <Textarea
                      id="bulk-emails"
                      placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                      rows={6}
                      data-testid="textarea-bulk-emails"
                    />
                    <p className="text-sm text-muted-foreground">
                      {inviteEmails.split(/[,\n]/).filter(e => e.trim() && e.includes('@')).length} valid email(s)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulk-role">Role for all invitees</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger data-testid="select-bulk-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="read_only">Read Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleBulkInvite}
                    disabled={!inviteEmails || bulkInviteMutation.isPending}
                    className="w-full"
                    data-testid="button-send-bulk-invitation"
                  >
                    {bulkInviteMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending Invitations...
                      </>
                    ) : (
                      'Send Bulk Invitations'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user: User) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell className="font-medium">
                        {user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName}`
                          : user.email.split('@')[0]}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : user.role === 'manager' ? 'secondary' : 'outline'}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            user.status === 'active' ? 'default' :
                            user.status === 'inactive' ? 'secondary' : 'destructive'
                          }
                        >
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={user.status === 'active'}
                          onCheckedChange={(checked) => toggleUserMutation.mutate({ userId: user.id, enabled: checked })}
                          disabled={user.id === currentUser?.id || toggleUserMutation.isPending}
                          data-testid={`switch-user-enabled-${user.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {user.id !== currentUser?.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" data-testid={`button-user-actions-${user.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => forcePasswordResetMutation.mutate(user.id)}
                                data-testid={`button-force-password-reset-${user.id}`}
                              >
                                <Key className="mr-2 h-4 w-4" />
                                Force Password Reset
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => unlockAccountMutation.mutate(user.email)}
                                data-testid={`button-unlock-account-${user.id}`}
                              >
                                <Unlock className="mr-2 h-4 w-4" />
                                Unlock Account
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/users/${user.id}`} className="flex items-center cursor-pointer">
                                  <UserCog className="mr-2 h-4 w-4" />
                                  View Details
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            Showing {users.length} of {usersData?.total || 0} users
          </div>
        </TabsContent>

        <TabsContent value="roles">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Roles
                </CardTitle>
                <CardDescription>System and custom roles with permission bundles</CardDescription>
              </CardHeader>
              <CardContent>
                {rolesLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {roles.map((role) => (
                      <div 
                        key={role.id}
                        className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        data-testid={`role-card-${role.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: role.color || '#6B7280' }}
                            />
                            <div>
                              <h4 className="font-medium flex items-center gap-2">
                                {role.name}
                                {role.isSystem && <Badge variant="outline" className="text-xs">System</Badge>}
                                {role.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                              </h4>
                              <p className="text-sm text-muted-foreground">{role.description}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  Permission Matrix
                </CardTitle>
                <CardDescription>All available permissions by category</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-y-auto">
                {permissionsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i}>
                        <Skeleton className="h-6 w-24 mb-2" />
                        <div className="space-y-2 pl-4">
                          {Array.from({ length: 4 }).map((_, j) => (
                            <Skeleton key={j} className="h-4 w-full" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(groupedPermissions).map(([category, perms]) => (
                      <div key={category}>
                        <h4 className="font-medium capitalize mb-2 flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          {category.replace('_', ' ')}
                        </h4>
                        <div className="space-y-1 pl-6">
                          {perms.map((perm) => (
                            <div key={perm.id} className="flex items-center justify-between text-sm py-1" data-testid={`permission-${perm.key}`}>
                              <span className="text-muted-foreground">{perm.name}</span>
                              <code className="text-xs bg-muted px-1 rounded">{perm.key}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="teams">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold">Team Structure</h2>
              <p className="text-sm text-muted-foreground">Organize users into teams with hierarchy</p>
            </div>
            <Button data-testid="button-create-team">
              <UsersRound className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          </div>

          {teamsLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : teams.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <UsersRound className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-2">No teams yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Create your first team to organize your users</p>
                <Button data-testid="button-create-first-team">
                  <UsersRound className="mr-2 h-4 w-4" />
                  Create Team
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => (
                <Card key={team.id} className="hover:shadow-md transition-shadow cursor-pointer" data-testid={`team-card-${team.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: team.color || '#6B7280' }}
                      />
                      <CardTitle className="text-lg">{team.name}</CardTitle>
                    </div>
                    {team.description && (
                      <CardDescription>{team.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {team.memberCount || 0} members
                      </span>
                      {team.parentTeamId && (
                        <Badge variant="outline" className="text-xs">Sub-team</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Activity Logs
              </CardTitle>
              <CardDescription>Recent user actions and system events</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-3/4 mb-2" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No activity logs yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-4 p-3 border rounded-lg" data-testid={`activity-log-${log.id}`}>
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Activity className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{log.user?.email || 'Unknown user'}</span>
                          {' '}
                          <span className="text-muted-foreground">{log.action}</span>
                          {log.entityType && (
                            <span className="text-muted-foreground"> on {log.entityType}</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {new Date(log.createdAt).toLocaleString()}
                          {log.ipAddress && (
                            <>
                              <span className="mx-1">·</span>
                              <span>{log.ipAddress}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {activityData && activityData.pages > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                        disabled={activityPage === 1}
                        data-testid="button-activity-prev"
                      >
                        Previous
                      </Button>
                      <span className="py-2 px-3 text-sm text-muted-foreground">
                        Page {activityPage} of {activityData.pages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setActivityPage(p => Math.min(activityData.pages, p + 1))}
                        disabled={activityPage === activityData.pages}
                        data-testid="button-activity-next"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
