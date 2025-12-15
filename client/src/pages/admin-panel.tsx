import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { UserPlus, Search, MoreVertical, Trash2, RotateCcw, Loader2, Unlock, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string | null;
  createdAt: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function AdminPanel() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const { data: usersData, isLoading } = useQuery<UsersResponse>({
    queryKey: ['/api/users', { search: searchQuery, status: statusFilter !== 'all' ? statusFilter : undefined, role: roleFilter !== 'all' ? roleFilter : undefined }],
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: 'admin' | 'user' }) => {
      const response = await apiRequest('POST', '/api/auth/invitations', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send invitation');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Invitation sent',
        description: `Invitation sent to ${inviteEmail}`,
      });
      setInviteEmail('');
      setInviteRole('user');
      setIsInviteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/invitations'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send invitation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('DELETE', `/api/users/${userId}`, undefined);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete user');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'User deleted',
        description: 'User has been soft deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete user',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const reactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('POST', `/api/users/${userId}/reactivate`, undefined);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reactivate user');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'User reactivated',
        description: 'User has been reactivated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to reactivate user',
        description: error.message,
        variant: 'destructive',
      });
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
      toast({
        title: 'Account unlocked',
        description: 'Account has been unlocked successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to unlock account',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleInvite = () => {
    if (!inviteEmail) return;
    inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
  };

  const users = usersData?.users || [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">User Management</h1>
        </div>
        <p className="text-muted-foreground ml-12">Manage users, roles, and invitations</p>
      </div>

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
            <SelectItem value="user">User</SelectItem>
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
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  data-testid="input-invite-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'user')}>
                  <SelectTrigger data-testid="select-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleInvite}
                disabled={!inviteEmail || inviteMutation.isPending}
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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        user.status === 'active'
                          ? 'default'
                          : user.status === 'inactive'
                          ? 'secondary'
                          : 'destructive'
                      }
                    >
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleDateString()
                      : 'Never'}
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
                            onClick={() => unlockAccountMutation.mutate(user.email)}
                            data-testid={`button-unlock-account-${user.id}`}
                          >
                            <Unlock className="mr-2 h-4 w-4" />
                            Unlock Account
                          </DropdownMenuItem>
                          {user.status === 'active' ? (
                            <DropdownMenuItem
                              onClick={() => deleteUserMutation.mutate(user.id)}
                              className="text-destructive"
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => reactivateUserMutation.mutate(user.id)}
                              data-testid={`button-reactivate-user-${user.id}`}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Reactivate
                            </DropdownMenuItem>
                          )}
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
    </div>
  );
}
