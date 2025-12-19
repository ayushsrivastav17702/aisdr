import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Building, 
  Plus, 
  Search, 
  MoreVertical, 
  Archive, 
  Trash2, 
  Users, 
  Settings,
  ArrowLeft,
  Loader2,
  RefreshCw,
  UserPlus,
  FolderTree,
  ArrowRightLeft
} from 'lucide-react';
import { Link } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';

interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  type: string | null;
  parentId: string | null;
  settings: {
    dailyEmailLimit?: number;
    aiPersonalizationEnabled?: boolean;
    allowedDomains?: string[];
  } | null;
  resourceLimits: {
    maxProspects?: number;
    maxSequences?: number;
    maxMailboxes?: number;
    maxDailyEmails?: number;
  } | null;
  status: 'active' | 'archived' | 'deleted';
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface Organization {
  id: string;
  name: string;
}

interface WorkspaceMember {
  membership: {
    id: string;
    workspaceId: string;
    userId: string;
    role: string;
    permissions: string[] | null;
    joinedAt: string;
  };
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  };
}

const WORKSPACE_TYPES = [
  { value: 'default', label: 'Default' },
  { value: 'region', label: 'Region' },
  { value: 'product', label: 'Product Line' },
  { value: 'team', label: 'Team' },
  { value: 'project', label: 'Project' },
];

export default function WorkspaceManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  
  const [newWorkspace, setNewWorkspace] = useState({
    name: '',
    description: '',
    type: 'default',
    parentId: '',
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ['/api/organizations'],
  });

  const currentOrg = organizations?.[0];

  const { data: workspaces, isLoading } = useQuery<Workspace[]>({
    queryKey: ['/api/workspaces', { organizationId: currentOrg?.id }],
    enabled: !!currentOrg?.id,
  });

  const { data: members } = useQuery<WorkspaceMember[]>({
    queryKey: ['/api/workspaces', selectedWorkspace?.id, 'members'],
    enabled: !!selectedWorkspace?.id && isMembersDialogOpen,
  });

  const filteredWorkspaces = workspaces?.filter(ws => {
    const matchesSearch = ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ws.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ws.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: async (data: typeof newWorkspace & { organizationId: string }) => {
      const response = await apiRequest('POST', '/api/workspaces', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create workspace');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Workspace created',
        description: 'New workspace has been created successfully.',
      });
      setIsCreateDialogOpen(false);
      setNewWorkspace({ name: '', description: '', type: 'default', parentId: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create workspace',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Workspace> }) => {
      const response = await apiRequest('PATCH', `/api/workspaces/${id}`, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update workspace');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Workspace updated',
        description: 'Workspace settings have been updated.',
      });
      setIsEditDialogOpen(false);
      setSelectedWorkspace(null);
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update workspace',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const archiveWorkspaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/workspaces/${id}/archive`, {});
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to archive workspace');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Workspace archived',
        description: 'Workspace has been archived successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to archive workspace',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const restoreWorkspaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/workspaces/${id}/restore`, {});
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to restore workspace');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Workspace restored',
        description: 'Workspace has been restored successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to restore workspace',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/workspaces/${id}`, undefined);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete workspace');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Workspace deleted',
        description: 'Workspace has been permanently deleted.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete workspace',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateWorkspace = () => {
    if (!currentOrg) return;
    createWorkspaceMutation.mutate({
      ...newWorkspace,
      organizationId: currentOrg.id,
    });
  };

  const handleUpdateWorkspace = () => {
    if (!selectedWorkspace) return;
    updateWorkspaceMutation.mutate({
      id: selectedWorkspace.id,
      data: {
        name: selectedWorkspace.name,
        description: selectedWorkspace.description,
        type: selectedWorkspace.type,
        parentId: selectedWorkspace.parentId,
      },
    });
  };

  const getStatusBadge = (status: Workspace['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case 'archived':
        return <Badge variant="secondary">Archived</Badge>;
      case 'deleted':
        return <Badge variant="destructive">Deleted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getWorkspaceTypeLabel = (type: string | null) => {
    const found = WORKSPACE_TYPES.find(t => t.value === type);
    return found?.label || type || 'Default';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-workspace-management">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-page-title">Workspace Management</h1>
              <p className="text-sm text-muted-foreground">
                Create and manage workspaces for your organization
              </p>
            </div>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-workspace">
                <Plus className="h-4 w-4 mr-2" />
                Create Workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Workspace</DialogTitle>
                <DialogDescription>
                  Create a new workspace for your team or project
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="ws-name">Workspace Name</Label>
                  <Input
                    id="ws-name"
                    value={newWorkspace.name}
                    onChange={(e) => setNewWorkspace(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., APAC Sales Team"
                    data-testid="input-workspace-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-description">Description</Label>
                  <Textarea
                    id="ws-description"
                    value={newWorkspace.description}
                    onChange={(e) => setNewWorkspace(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What is this workspace for?"
                    rows={3}
                    data-testid="input-workspace-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-type">Workspace Type</Label>
                  <Select
                    value={newWorkspace.type}
                    onValueChange={(value) => setNewWorkspace(prev => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger data-testid="select-workspace-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKSPACE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {workspaces && workspaces.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="ws-parent">Parent Workspace (Optional)</Label>
                    <Select
                      value={newWorkspace.parentId}
                      onValueChange={(value) => setNewWorkspace(prev => ({ ...prev, parentId: value }))}
                    >
                      <SelectTrigger data-testid="select-parent-workspace">
                        <SelectValue placeholder="No parent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No parent</SelectItem>
                        {workspaces.filter(ws => ws.status === 'active').map((ws) => (
                          <SelectItem key={ws.id} value={ws.id}>
                            {ws.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateWorkspace}
                  disabled={!newWorkspace.name || createWorkspaceMutation.isPending}
                  data-testid="button-confirm-create"
                >
                  {createWorkspaceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Workspace
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-32" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!currentOrg ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Organization Found</h3>
              <p className="text-muted-foreground text-center mb-4">
                You need to create an organization before managing workspaces.
              </p>
              <Link href="/organization-settings">
                <Button data-testid="button-create-org">Create Organization</Button>
              </Link>
            </CardContent>
          </Card>
        ) : filteredWorkspaces?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderTree className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Workspaces Found</h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchQuery ? 'No workspaces match your search.' : 'Create your first workspace to get started.'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Workspace
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkspaces?.map((workspace) => (
                  <TableRow key={workspace.id} data-testid={`row-workspace-${workspace.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Building className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium" data-testid={`text-workspace-name-${workspace.id}`}>
                            {workspace.name}
                          </p>
                          {workspace.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {workspace.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getWorkspaceTypeLabel(workspace.type)}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(workspace.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(workspace.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${workspace.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedWorkspace(workspace);
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-2" />
                            Edit Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedWorkspace(workspace);
                              setIsMembersDialogOpen(true);
                            }}
                          >
                            <Users className="h-4 w-4 mr-2" />
                            Manage Members
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedWorkspace(workspace);
                              setIsTransferDialogOpen(true);
                            }}
                          >
                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                            Transfer Ownership
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {workspace.status === 'active' ? (
                            <DropdownMenuItem
                              onClick={() => archiveWorkspaceMutation.mutate(workspace.id)}
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => restoreWorkspaceMutation.mutate(workspace.id)}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Restore
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm('Are you sure you want to permanently delete this workspace?')) {
                                deleteWorkspaceMutation.mutate(workspace.id);
                              }
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workspace</DialogTitle>
            <DialogDescription>Update workspace settings</DialogDescription>
          </DialogHeader>
          {selectedWorkspace && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={selectedWorkspace.name}
                  onChange={(e) => setSelectedWorkspace(prev => prev ? { ...prev, name: e.target.value } : null)}
                  data-testid="input-edit-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={selectedWorkspace.description || ''}
                  onChange={(e) => setSelectedWorkspace(prev => prev ? { ...prev, description: e.target.value } : null)}
                  rows={3}
                  data-testid="input-edit-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-type">Type</Label>
                <Select
                  value={selectedWorkspace.type || 'default'}
                  onValueChange={(value) => setSelectedWorkspace(prev => prev ? { ...prev, type: value } : null)}
                >
                  <SelectTrigger data-testid="select-edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKSPACE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateWorkspace}
              disabled={updateWorkspaceMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateWorkspaceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMembersDialogOpen} onOpenChange={setIsMembersDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Workspace Members</DialogTitle>
            <DialogDescription>
              {selectedWorkspace?.name} - Manage team members
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {members && members.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.membership.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {member.user.firstName} {member.user.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.membership.role}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(member.membership.joinedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No members in this workspace yet</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMembersDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Transfer ownership of {selectedWorkspace?.name} to another user
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This feature allows you to transfer workspace ownership to another team member.
              The new owner will have full administrative access to this workspace.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
