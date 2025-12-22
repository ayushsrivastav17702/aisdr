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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Globe, 
  Key, 
  Webhook, 
  Mail, 
  Shield, 
  Bell, 
  Bot,
  Plus,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  Settings,
  AlertTriangle,
  FileText,
  Upload,
  Ban,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { Link } from 'wouter';

interface SendingDomain {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  dkimRecord: string | null;
  spfRecord: string | null;
  dmarcRecord: string | null;
  dkimVerified: boolean;
  spfVerified: boolean;
  dmarcVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string | null;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface DoNotContactEntry {
  id: string;
  email: string | null;
  domain: string | null;
  phone: string | null;
  reason: string;
  notes: string | null;
  createdAt: string;
}

interface DeliverabilitySettings {
  dailySendLimit: number;
  hourlySendLimit: number;
  warmupEnabled: boolean;
  warmupDailyIncrement: number;
  bounceThreshold: number;
  complaintsThreshold: number;
  autoDisableOnBounce: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
  customTrackingDomain: string | null;
  unsubscribeLink: boolean;
  footerHtml: string | null;
}

interface AiConfiguration {
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  enableFallback: boolean;
  fallbackModel: string | null;
  monthlyBudget: number | null;
  totalUsed: number;
}

interface NotificationPreference {
  id: string;
  notificationType: string;
  enabled: boolean;
  channels: string[];
  recipientEmails: string[] | null;
  threshold: number | null;
  thresholdUnit: string | null;
}

export default function AdminInfrastructure() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('email-infrastructure');
  
  if (!user || user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Admin Access Required</h3>
            <p className="text-sm text-muted-foreground mt-2">
              You need administrator privileges to access this page.
            </p>
            <Link href="/">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/organization-settings">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Organization Settings
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Admin Infrastructure</h1>
        <p className="text-muted-foreground mt-1">
          Manage email infrastructure, API access, compliance, and AI configuration.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:grid-cols-none lg:flex" data-testid="tabs-admin-infrastructure">
          <TabsTrigger value="email-infrastructure" className="gap-2" data-testid="tab-email-infrastructure">
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">Email Infrastructure</span>
          </TabsTrigger>
          <TabsTrigger value="api-access" className="gap-2" data-testid="tab-api-access">
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">API Access</span>
          </TabsTrigger>
          <TabsTrigger value="email-settings" className="gap-2" data-testid="tab-email-settings">
            <Mail className="w-4 h-4" />
            <span className="hidden sm:inline">Email Settings</span>
          </TabsTrigger>
          <TabsTrigger value="ai-config" className="gap-2" data-testid="tab-ai-config">
            <Bot className="w-4 h-4" />
            <span className="hidden sm:inline">AI Configuration</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2" data-testid="tab-notifications">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email-infrastructure" className="space-y-6">
          <SendingDomainsSection />
        </TabsContent>

        <TabsContent value="api-access" className="space-y-6">
          <ApiAccessSection />
        </TabsContent>

        <TabsContent value="email-settings" className="space-y-6">
          <EmailSettingsSection />
        </TabsContent>

        <TabsContent value="ai-config" className="space-y-6">
          <AiConfigSection />
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <NotificationsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SendingDomainsSection() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDomain, setNewDomain] = useState('');

  const { data: domainsData, isLoading } = useQuery<{ domains: SendingDomain[] }>({
    queryKey: ['/api/admin/sending-domains'],
  });

  const addDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const res = await apiRequest('POST', '/api/admin/sending-domains', { domain });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sending-domains'] });
      setShowAddDialog(false);
      setNewDomain('');
      toast({ title: 'Domain added', description: 'Please configure the DNS records to verify.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const res = await apiRequest('POST', `/api/admin/sending-domains/${domainId}/verify`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sending-domains'] });
      toast({ title: 'Verification started', description: 'DNS records are being checked.' });
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const res = await apiRequest('DELETE', `/api/admin/sending-domains/${domainId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sending-domains'] });
      toast({ title: 'Domain removed' });
    },
  });

  const domains = domainsData?.domains || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sending Domains</CardTitle>
            <CardDescription>Configure and verify domains for email sending</CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-domain">
                <Plus className="w-4 h-4 mr-2" />
                Add Domain
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Sending Domain</DialogTitle>
                <DialogDescription>
                  Enter the domain you want to use for sending emails.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <Input
                    id="domain"
                    placeholder="example.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    data-testid="input-domain"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button 
                  onClick={() => addDomainMutation.mutate(newDomain)}
                  disabled={!newDomain || addDomainMutation.isPending}
                  data-testid="button-submit-domain"
                >
                  {addDomainMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add Domain
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No sending domains configured</p>
              <p className="text-sm">Add a domain to start sending emails</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>DKIM</TableHead>
                  <TableHead>SPF</TableHead>
                  <TableHead>DMARC</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((domain) => (
                  <TableRow key={domain.id} data-testid={`row-domain-${domain.id}`}>
                    <TableCell className="font-medium">{domain.domain}</TableCell>
                    <TableCell>
                      <Badge variant={domain.status === 'verified' ? 'default' : domain.status === 'failed' ? 'destructive' : 'secondary'}>
                        {domain.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {domain.dkimVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      {domain.spfVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      {domain.dmarcVerified ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => verifyDomainMutation.mutate(domain.id)}
                          disabled={verifyDomainMutation.isPending}
                          data-testid={`button-verify-domain-${domain.id}`}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteDomainMutation.mutate(domain.id)}
                          data-testid={`button-delete-domain-${domain.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApiAccessSection() {
  const { toast } = useToast();
  const [showAddKeyDialog, setShowAddKeyDialog] = useState(false);
  const [showAddWebhookDialog, setShowAddWebhookDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read']);
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['prospect.created']);

  const { data: apiKeysData, isLoading: keysLoading } = useQuery<{ apiKeys: ApiKey[] }>({
    queryKey: ['/api/admin/api-keys'],
  });

  const { data: webhooksData, isLoading: webhooksLoading } = useQuery<{ webhooks: Webhook[] }>({
    queryKey: ['/api/admin/webhooks'],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (data: { name: string; scopes: string[]; expiresAt?: string }) => {
      const res = await apiRequest('POST', '/api/admin/api-keys', data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-keys'] });
      setCreatedKey(data.key);
      setNewKeyName('');
      setNewKeyScopes(['read']);
      setNewKeyExpiry('');
      toast({ title: 'API key created', description: 'Make sure to copy the key now. You won\'t be able to see it again.' });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const res = await apiRequest('DELETE', `/api/admin/api-keys/${keyId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-keys'] });
      toast({ title: 'API key deleted' });
    },
  });

  const createWebhookMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; events: string[] }) => {
      const res = await apiRequest('POST', '/api/admin/webhooks', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/webhooks'] });
      setShowAddWebhookDialog(false);
      setNewWebhookName('');
      setNewWebhookUrl('');
      setNewWebhookEvents(['prospect.created']);
      toast({ title: 'Webhook created' });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (webhookId: string) => {
      const res = await apiRequest('DELETE', `/api/admin/webhooks/${webhookId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/webhooks'] });
      toast({ title: 'Webhook deleted' });
    },
  });

  const apiKeys = apiKeysData?.apiKeys || [];
  const webhooks = webhooksData?.webhooks || [];

  const availableScopes = ['read', 'write', 'admin', 'prospects', 'sequences', 'mailboxes'];
  const availableEvents = [
    'prospect.created', 'prospect.updated', 'prospect.enriched',
    'sequence.completed', 'email.sent', 'email.opened', 'email.clicked', 'email.replied', 'email.bounced'
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>Manage API keys for programmatic access</CardDescription>
          </div>
          <Dialog open={showAddKeyDialog} onOpenChange={(open) => {
            setShowAddKeyDialog(open);
            if (!open) setCreatedKey(null);
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-api-key">
                <Plus className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{createdKey ? 'API Key Created' : 'Create API Key'}</DialogTitle>
                <DialogDescription>
                  {createdKey ? 'Copy your API key now. You won\'t be able to see it again.' : 'Generate a new API key with specific permissions.'}
                </DialogDescription>
              </DialogHeader>
              {createdKey ? (
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-muted rounded-lg font-mono text-sm break-all flex items-center gap-2">
                    <span className={showKey ? '' : 'blur-sm select-none'}>{createdKey}</span>
                    <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      navigator.clipboard.writeText(createdKey);
                      toast({ title: 'Copied to clipboard' });
                    }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <AlertTriangle className="w-4 h-4 inline mr-1 text-yellow-500" />
                    This key will only be shown once.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="keyName">Key Name</Label>
                    <Input
                      id="keyName"
                      placeholder="Production API Key"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      data-testid="input-api-key-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scopes</Label>
                    <div className="flex flex-wrap gap-2">
                      {availableScopes.map((scope) => (
                        <Badge
                          key={scope}
                          variant={newKeyScopes.includes(scope) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => {
                            setNewKeyScopes(prev =>
                              prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
                            );
                          }}
                        >
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="keyExpiry">Expiry Date (optional)</Label>
                    <Input
                      id="keyExpiry"
                      type="date"
                      value={newKeyExpiry}
                      onChange={(e) => setNewKeyExpiry(e.target.value)}
                      data-testid="input-api-key-expiry"
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                {createdKey ? (
                  <Button onClick={() => { setShowAddKeyDialog(false); setCreatedKey(null); }}>Done</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowAddKeyDialog(false)}>Cancel</Button>
                    <Button
                      onClick={() => createKeyMutation.mutate({
                        name: newKeyName,
                        scopes: newKeyScopes,
                        expiresAt: newKeyExpiry || undefined
                      })}
                      disabled={!newKeyName || newKeyScopes.length === 0 || createKeyMutation.isPending}
                      data-testid="button-submit-api-key"
                    >
                      {createKeyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Create Key
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {keysLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No API keys created</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id} data-testid={`row-api-key-${key.id}`}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell><code className="text-xs">{key.prefix}...</code></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.slice(0, 3).map((scope) => (
                          <Badge key={scope} variant="secondary" className="text-xs">{scope}</Badge>
                        ))}
                        {key.scopes.length > 3 && (
                          <Badge variant="secondary" className="text-xs">+{key.scopes.length - 3}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{key.usageCount.toLocaleString()} requests</TableCell>
                    <TableCell>
                      <Badge variant={key.isActive ? 'default' : 'secondary'}>
                        {key.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteKeyMutation.mutate(key.id)}
                        data-testid={`button-delete-api-key-${key.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>Configure webhooks for real-time event notifications</CardDescription>
          </div>
          <Dialog open={showAddWebhookDialog} onOpenChange={setShowAddWebhookDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-add-webhook">
                <Plus className="w-4 h-4 mr-2" />
                Add Webhook
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Webhook</DialogTitle>
                <DialogDescription>Configure a webhook endpoint to receive event notifications.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="webhookName">Name</Label>
                  <Input
                    id="webhookName"
                    placeholder="CRM Integration"
                    value={newWebhookName}
                    onChange={(e) => setNewWebhookName(e.target.value)}
                    data-testid="input-webhook-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">URL</Label>
                  <Input
                    id="webhookUrl"
                    placeholder="https://api.example.com/webhook"
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    data-testid="input-webhook-url"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Events</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableEvents.map((event) => (
                      <Badge
                        key={event}
                        variant={newWebhookEvents.includes(event) ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => {
                          setNewWebhookEvents(prev =>
                            prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
                          );
                        }}
                      >
                        {event}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddWebhookDialog(false)}>Cancel</Button>
                <Button
                  onClick={() => createWebhookMutation.mutate({
                    name: newWebhookName,
                    url: newWebhookUrl,
                    events: newWebhookEvents
                  })}
                  disabled={!newWebhookName || !newWebhookUrl || newWebhookEvents.length === 0}
                  data-testid="button-submit-webhook"
                >
                  Create Webhook
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {webhooksLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No webhooks configured</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.map((webhook) => (
                  <TableRow key={webhook.id} data-testid={`row-webhook-${webhook.id}`}>
                    <TableCell className="font-medium">{webhook.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{webhook.url}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {webhook.events.slice(0, 2).map((event) => (
                          <Badge key={event} variant="secondary" className="text-xs">{event}</Badge>
                        ))}
                        {webhook.events.length > 2 && (
                          <Badge variant="secondary" className="text-xs">+{webhook.events.length - 2}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={webhook.isActive ? 'default' : 'secondary'}>
                        {webhook.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteWebhookMutation.mutate(webhook.id)}
                        data-testid={`button-delete-webhook-${webhook.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmailSettingsSection() {
  const { toast } = useToast();
  const [showAddDncDialog, setShowAddDncDialog] = useState(false);
  const [newDncEmail, setNewDncEmail] = useState('');
  const [newDncDomain, setNewDncDomain] = useState('');
  const [newDncReason, setNewDncReason] = useState('');

  const { data: settingsData, isLoading: settingsLoading } = useQuery<DeliverabilitySettings>({
    queryKey: ['/api/admin/deliverability-settings'],
  });

  const { data: dncData, isLoading: dncLoading } = useQuery<{ entries: DoNotContactEntry[]; total: number }>({
    queryKey: ['/api/admin/do-not-contact'],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<DeliverabilitySettings>) => {
      const res = await apiRequest('PATCH', '/api/admin/deliverability-settings', settings);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/deliverability-settings'] });
      toast({ title: 'Settings updated' });
    },
  });

  const addDncMutation = useMutation({
    mutationFn: async (data: { email?: string; domain?: string; reason: string }) => {
      const res = await apiRequest('POST', '/api/admin/do-not-contact', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/do-not-contact'] });
      setShowAddDncDialog(false);
      setNewDncEmail('');
      setNewDncDomain('');
      setNewDncReason('');
      toast({ title: 'Entry added to Do Not Contact list' });
    },
  });

  const deleteDncMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/admin/do-not-contact/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/do-not-contact'] });
      toast({ title: 'Entry removed' });
    },
  });

  const settings = settingsData || {} as DeliverabilitySettings;
  const dncEntries = dncData?.entries || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Deliverability Settings</CardTitle>
          <CardDescription>Configure email sending limits, tracking, and warmup</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {settingsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Daily Send Limit</Label>
                  <Input
                    type="number"
                    value={settings.dailySendLimit || 500}
                    onChange={(e) => updateSettingsMutation.mutate({ dailySendLimit: parseInt(e.target.value) })}
                    data-testid="input-daily-limit"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hourly Send Limit</Label>
                  <Input
                    type="number"
                    value={settings.hourlySendLimit || 50}
                    onChange={(e) => updateSettingsMutation.mutate({ hourlySendLimit: parseInt(e.target.value) })}
                    data-testid="input-hourly-limit"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Warmup Mode</Label>
                    <p className="text-sm text-muted-foreground">Gradually increase sending volume</p>
                  </div>
                  <Switch
                    checked={settings.warmupEnabled || false}
                    onCheckedChange={(checked) => updateSettingsMutation.mutate({ warmupEnabled: checked })}
                    data-testid="switch-warmup"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Track Opens</Label>
                    <p className="text-sm text-muted-foreground">Track when recipients open emails</p>
                  </div>
                  <Switch
                    checked={settings.trackOpens !== false}
                    onCheckedChange={(checked) => updateSettingsMutation.mutate({ trackOpens: checked })}
                    data-testid="switch-track-opens"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Track Clicks</Label>
                    <p className="text-sm text-muted-foreground">Track link clicks in emails</p>
                  </div>
                  <Switch
                    checked={settings.trackClicks !== false}
                    onCheckedChange={(checked) => updateSettingsMutation.mutate({ trackClicks: checked })}
                    data-testid="switch-track-clicks"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Include Unsubscribe Link</Label>
                    <p className="text-sm text-muted-foreground">Add unsubscribe link to emails</p>
                  </div>
                  <Switch
                    checked={settings.unsubscribeLink !== false}
                    onCheckedChange={(checked) => updateSettingsMutation.mutate({ unsubscribeLink: checked })}
                    data-testid="switch-unsubscribe"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Bounce Threshold (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.bounceThreshold || 5}
                    onChange={(e) => updateSettingsMutation.mutate({ bounceThreshold: parseFloat(e.target.value) })}
                    data-testid="input-bounce-threshold"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Complaints Threshold (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.complaintsThreshold || 0.1}
                    onChange={(e) => updateSettingsMutation.mutate({ complaintsThreshold: parseFloat(e.target.value) })}
                    data-testid="input-complaints-threshold"
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Do Not Contact List</CardTitle>
            <CardDescription>Manage suppression list for compliance</CardDescription>
          </div>
          <Dialog open={showAddDncDialog} onOpenChange={setShowAddDncDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-add-dnc">
                <Plus className="w-4 h-4 mr-2" />
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add to Do Not Contact List</DialogTitle>
                <DialogDescription>Add an email or domain to the suppression list.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="dncEmail">Email Address</Label>
                  <Input
                    id="dncEmail"
                    placeholder="user@example.com"
                    value={newDncEmail}
                    onChange={(e) => setNewDncEmail(e.target.value)}
                    data-testid="input-dnc-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dncDomain">Or Domain (blocks all emails to this domain)</Label>
                  <Input
                    id="dncDomain"
                    placeholder="example.com"
                    value={newDncDomain}
                    onChange={(e) => setNewDncDomain(e.target.value)}
                    data-testid="input-dnc-domain"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dncReason">Reason</Label>
                  <Select value={newDncReason} onValueChange={setNewDncReason}>
                    <SelectTrigger data-testid="select-dnc-reason">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                      <SelectItem value="bounced">Bounced</SelectItem>
                      <SelectItem value="complained">Spam Complaint</SelectItem>
                      <SelectItem value="manual">Manual Addition</SelectItem>
                      <SelectItem value="legal">Legal Request</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDncDialog(false)}>Cancel</Button>
                <Button
                  onClick={() => addDncMutation.mutate({
                    email: newDncEmail || undefined,
                    domain: newDncDomain || undefined,
                    reason: newDncReason
                  })}
                  disabled={(!newDncEmail && !newDncDomain) || !newDncReason}
                  data-testid="button-submit-dnc"
                >
                  Add Entry
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {dncLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : dncEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Ban className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No entries in the Do Not Contact list</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email/Domain</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dncEntries.map((entry) => (
                  <TableRow key={entry.id} data-testid={`row-dnc-${entry.id}`}>
                    <TableCell className="font-medium">
                      {entry.email || entry.domain}
                      {entry.domain && <Badge variant="outline" className="ml-2 text-xs">Domain</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{entry.reason}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteDncMutation.mutate(entry.id)}
                        data-testid={`button-delete-dnc-${entry.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AiConfigSection() {
  const { toast } = useToast();

  const { data: configData, isLoading } = useQuery<AiConfiguration>({
    queryKey: ['/api/admin/ai-config'],
  });

  const { data: modelsData } = useQuery<{ models: { id: string; name: string; provider: string; costPer1kTokens: number }[] }>({
    queryKey: ['/api/admin/ai-models'],
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (config: Partial<AiConfiguration>) => {
      const res = await apiRequest('PATCH', '/api/admin/ai-config', config);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/ai-config'] });
      toast({ title: 'AI configuration updated' });
    },
  });

  const config = configData || {} as AiConfiguration;
  const models = modelsData?.models || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Model Configuration</CardTitle>
          <CardDescription>Configure AI models for email generation and analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Default Model</Label>
                  <Select
                    value={config.defaultModel || 'gpt-4o-mini'}
                    onValueChange={(value) => updateConfigMutation.mutate({ defaultModel: value })}
                  >
                    <SelectTrigger data-testid="select-default-model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name} ({model.provider})
                        </SelectItem>
                      ))}
                      {models.length === 0 && (
                        <>
                          <SelectItem value="gpt-4o-mini">GPT-4o Mini (OpenAI)</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o (OpenAI)</SelectItem>
                          <SelectItem value="claude-3-sonnet">Claude 3 Sonnet (Anthropic)</SelectItem>
                          <SelectItem value="claude-3-opus">Claude 3 Opus (Anthropic)</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fallback Model</Label>
                  <Select
                    value={config.fallbackModel || 'gpt-4o-mini'}
                    onValueChange={(value) => updateConfigMutation.mutate({ fallbackModel: value })}
                  >
                    <SelectTrigger data-testid="select-fallback-model">
                      <SelectValue placeholder="Select fallback" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini (OpenAI)</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (OpenAI)</SelectItem>
                      <SelectItem value="claude-3-haiku">Claude 3 Haiku (Anthropic)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Temperature: {(config.temperature || 0.7).toFixed(1)}</Label>
                    <span className="text-sm text-muted-foreground">
                      {(config.temperature || 0.7) < 0.3 ? 'More focused' : (config.temperature || 0.7) > 0.7 ? 'More creative' : 'Balanced'}
                    </span>
                  </div>
                  <Slider
                    value={[config.temperature || 0.7]}
                    min={0}
                    max={1}
                    step={0.1}
                    onValueChange={([value]) => updateConfigMutation.mutate({ temperature: value })}
                    data-testid="slider-temperature"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    value={config.maxTokens || 2048}
                    onChange={(e) => updateConfigMutation.mutate({ maxTokens: parseInt(e.target.value) })}
                    data-testid="input-max-tokens"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Fallback</Label>
                    <p className="text-sm text-muted-foreground">Switch to fallback model if primary fails</p>
                  </div>
                  <Switch
                    checked={config.enableFallback !== false}
                    onCheckedChange={(checked) => updateConfigMutation.mutate({ enableFallback: checked })}
                    data-testid="switch-enable-fallback"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                <div className="space-y-2">
                  <Label>Monthly Budget ($)</Label>
                  <Input
                    type="number"
                    step="10"
                    value={config.monthlyBudget || ''}
                    placeholder="No limit"
                    onChange={(e) => updateConfigMutation.mutate({ monthlyBudget: e.target.value ? parseFloat(e.target.value) : null })}
                    data-testid="input-monthly-budget"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Usage This Month</Label>
                  <div className="text-2xl font-bold">${(config.totalUsed || 0).toFixed(2)}</div>
                  {config.monthlyBudget && (
                    <div className="text-sm text-muted-foreground">
                      {((config.totalUsed || 0) / config.monthlyBudget * 100).toFixed(1)}% of budget used
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsSection() {
  const { toast } = useToast();

  const { data: preferencesData, isLoading } = useQuery<{ preferences: NotificationPreference[] }>({
    queryKey: ['/api/admin/notification-preferences'],
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: async (data: { notificationType: string; enabled?: boolean; channels?: string[] }) => {
      const res = await apiRequest('PUT', '/api/admin/notification-preferences', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notification-preferences'] });
      toast({ title: 'Notification preferences updated' });
    },
  });

  const preferences = preferencesData?.preferences || [];

  const notificationTypes = [
    { type: 'daily_summary', label: 'Daily Summary', description: 'Daily email activity summary' },
    { type: 'weekly_report', label: 'Weekly Report', description: 'Weekly performance report' },
    { type: 'bounce_alert', label: 'Bounce Alert', description: 'Alert when bounce rate exceeds threshold' },
    { type: 'reply_notification', label: 'Reply Notifications', description: 'Notify when prospects reply' },
    { type: 'sequence_completed', label: 'Sequence Completed', description: 'Alert when sequence finishes' },
    { type: 'low_mailbox_health', label: 'Low Mailbox Health', description: 'Alert when mailbox health drops' },
    { type: 'budget_alert', label: 'AI Budget Alert', description: 'Alert when AI budget threshold reached' },
  ];

  const getPreference = (type: string) => preferences.find(p => p.notificationType === type);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Configure how you receive system notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            notificationTypes.map(({ type, label, description }) => {
              const pref = getPreference(type);
              return (
                <div key={type} className="flex items-center justify-between py-3 border-b last:border-b-0" data-testid={`notification-${type}`}>
                  <div className="space-y-1">
                    <Label className="text-base">{label}</Label>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <Badge
                        variant={pref?.channels?.includes('email') ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const currentChannels = pref?.channels || [];
                          const newChannels = currentChannels.includes('email')
                            ? currentChannels.filter(c => c !== 'email')
                            : [...currentChannels, 'email'];
                          updatePreferenceMutation.mutate({ notificationType: type, channels: newChannels, enabled: true });
                        }}
                      >
                        <Mail className="w-3 h-3 mr-1" />
                        Email
                      </Badge>
                      <Badge
                        variant={pref?.channels?.includes('in_app') ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const currentChannels = pref?.channels || [];
                          const newChannels = currentChannels.includes('in_app')
                            ? currentChannels.filter(c => c !== 'in_app')
                            : [...currentChannels, 'in_app'];
                          updatePreferenceMutation.mutate({ notificationType: type, channels: newChannels, enabled: true });
                        }}
                      >
                        <Bell className="w-3 h-3 mr-1" />
                        In-App
                      </Badge>
                    </div>
                    <Switch
                      checked={pref?.enabled ?? false}
                      onCheckedChange={(checked) => updatePreferenceMutation.mutate({ notificationType: type, enabled: checked })}
                      data-testid={`switch-notification-${type}`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
