import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { 
  Settings as SettingsIcon, 
  Key, 
  Shield, 
  Moon, 
  Bell, 
  User, 
  ArrowLeft, 
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Info
} from 'lucide-react';
import { Link } from 'wouter';
import { Breadcrumbs } from '@/components/breadcrumbs';

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast({
      title: 'Copied to clipboard',
      description: `${label} copied successfully`,
    });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-6">
      <div className="max-w-5xl mx-auto">
        <Breadcrumbs />
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage your account settings, API keys, and preferences
            </p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-[600px]">
            <TabsTrigger value="profile" data-testid="tab-profile">
              <User className="mr-2 h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">
              <Shield className="mr-2 h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="api-keys" data-testid="tab-api-keys">
              <Key className="mr-2 h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="preferences" data-testid="tab-preferences">
              <SettingsIcon className="mr-2 h-4 w-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>
                  Manage your profile information and account details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    For detailed profile management, password changes, and session controls, visit your{' '}
                    <Link href="/profile">
                      <Button variant="link" className="p-0 h-auto font-semibold" data-testid="link-profile">
                        Profile Page <ExternalLink className="ml-1 h-3 w-3 inline" />
                      </Button>
                    </Link>
                  </AlertDescription>
                </Alert>

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={user?.email || ''}
                      disabled
                      className="bg-muted"
                      data-testid="input-email-readonly"
                    />
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
                      <Label>First Name</Label>
                      <Input
                        value={user?.firstName || ''}
                        disabled
                        className="bg-muted"
                        data-testid="input-first-name-readonly"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input
                        value={user?.lastName || ''}
                        disabled
                        className="bg-muted"
                        data-testid="input-last-name-readonly"
                      />
                    </div>
                  </div>
                </div>

                <Link href="/profile">
                  <Button className="w-full" data-testid="button-go-to-profile">
                    <User className="mr-2 h-4 w-4" />
                    Go to Full Profile Page
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>
                  Manage your security preferences and authentication settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Two-Factor Authentication */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Two-Factor Authentication</Label>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      Coming Soon
                    </Badge>
                  </div>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Two-factor authentication (2FA) is currently being implemented. 
                      This feature will be available in the next release.
                    </AlertDescription>
                  </Alert>
                </div>

                <div className="border-t" />

                {/* Password Management */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Password</Label>
                      <p className="text-sm text-muted-foreground">
                        Last changed: Never (or recently)
                      </p>
                    </div>
                    <Link href="/profile">
                      <Button variant="outline" size="sm" data-testid="button-change-password">
                        Change Password
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="border-t" />

                {/* Active Sessions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Active Sessions</Label>
                      <p className="text-sm text-muted-foreground">
                        Manage your active sessions across devices
                      </p>
                    </div>
                    <Link href="/profile">
                      <Button variant="outline" size="sm" data-testid="button-manage-sessions">
                        Manage Sessions
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="border-t" />

                {/* Account Lockout Info */}
                <div className="space-y-3">
                  <div className="space-y-0.5">
                    <Label className="text-base">Account Security</Label>
                    <p className="text-sm text-muted-foreground">
                      Your account is protected with automatic lockout after 5 failed login attempts
                    </p>
                  </div>
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Security Features Active:</strong>
                      <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                        <li>Account lockout after 5 failed attempts (15 minutes)</li>
                        <li>30-minute idle session timeout</li>
                        <li>Secure HTTP-only cookies</li>
                        <li>Comprehensive audit logging</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>API Keys & Integrations</CardTitle>
                <CardDescription>
                  Configure external service API keys for platform features
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Important:</strong> API keys should be configured in your Replit Secrets panel for security. 
                    Never share your API keys or commit them to version control.
                  </AlertDescription>
                </Alert>

                {/* Apollo.io API Key */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Apollo.io API Key</Label>
                      <p className="text-sm text-muted-foreground">
                        Required for prospect search and enrichment
                      </p>
                    </div>
                    <Badge variant={process.env.APOLLO_API_KEY ? 'default' : 'destructive'}>
                      {process.env.APOLLO_API_KEY ? 'Configured' : 'Missing'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={process.env.APOLLO_API_KEY ? '••••••••••••••••' : ''}
                      disabled
                      className="flex-1 bg-muted"
                      placeholder="Configure in Replit Secrets"
                      data-testid="input-apollo-api-key"
                    />
                    <Button
                      variant="outline"
                      onClick={() => window.open('https://app.apollo.io/#/settings/integrations/api', '_blank')}
                      data-testid="button-get-apollo-key"
                    >
                      Get Key
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Secret name: <code className="bg-muted px-1 py-0.5 rounded">APOLLO_API_KEY</code>
                  </p>
                </div>

                <div className="border-t" />

                {/* Lusha API Key */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Lusha API Key</Label>
                      <p className="text-sm text-muted-foreground">
                        Optional: For additional email enrichment
                      </p>
                    </div>
                    <Badge variant="secondary">Optional</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={process.env.LUSHA_API_KEY ? '••••••••••••••••' : ''}
                      disabled
                      className="flex-1 bg-muted"
                      placeholder="Configure in Replit Secrets"
                      data-testid="input-lusha-api-key"
                    />
                    <Button
                      variant="outline"
                      onClick={() => window.open('https://www.lusha.com/api/', '_blank')}
                      data-testid="button-get-lusha-key"
                    >
                      Get Key
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Secret name: <code className="bg-muted px-1 py-0.5 rounded">LUSHA_API_KEY</code>
                  </p>
                </div>

                <div className="border-t" />

                {/* Redis/Upstash URL */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Redis URL (Upstash)</Label>
                      <p className="text-sm text-muted-foreground">
                        Required for background jobs and email queue
                      </p>
                    </div>
                    <Badge variant={process.env.REDIS_URL ? 'default' : 'destructive'}>
                      {process.env.REDIS_URL ? 'Configured' : 'Missing'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={process.env.REDIS_URL ? '••••••••••••••••' : ''}
                      disabled
                      className="flex-1 bg-muted"
                      placeholder="Configure in Replit Secrets"
                      data-testid="input-redis-url"
                    />
                    <Button
                      variant="outline"
                      onClick={() => window.open('https://upstash.com/', '_blank')}
                      data-testid="button-get-redis-url"
                    >
                      Get URL
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Secret name: <code className="bg-muted px-1 py-0.5 rounded">REDIS_URL</code>
                  </p>
                </div>

                <div className="border-t" />

                {/* Instructions */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>How to Configure Secrets:</strong>
                    <ol className="list-decimal list-inside mt-2 text-sm space-y-1">
                      <li>Open the Replit Secrets panel (Tools → Secrets or lock icon in sidebar)</li>
                      <li>Add a new secret with the exact name shown above (e.g., APOLLO_API_KEY)</li>
                      <li>Paste your API key as the value</li>
                      <li>Click "Add Secret" and restart your application</li>
                    </ol>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Application Preferences</CardTitle>
                <CardDescription>
                  Customize your application experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Dark Mode */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Enable dark mode for reduced eye strain
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      Coming Soon
                    </Badge>
                    <Switch
                      checked={darkMode}
                      onCheckedChange={setDarkMode}
                      disabled
                      data-testid="switch-dark-mode"
                    />
                  </div>
                </div>

                <div className="border-t" />

                {/* Email Notifications */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email notifications for important events
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                      Coming Soon
                    </Badge>
                    <Switch
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                      disabled
                      data-testid="switch-email-notifications"
                    />
                  </div>
                </div>

                <div className="border-t" />

                {/* Time Zone */}
                <div className="space-y-3">
                  <div className="space-y-0.5">
                    <Label className="text-base">Time Zone</Label>
                    <p className="text-sm text-muted-foreground">
                      Set your preferred time zone for timestamps
                    </p>
                  </div>
                  <Input
                    value={Intl.DateTimeFormat().resolvedOptions().timeZone}
                    disabled
                    className="bg-muted"
                    data-testid="input-timezone"
                  />
                  <p className="text-xs text-muted-foreground">
                    Automatically detected from your browser
                  </p>
                </div>

                <div className="border-t" />

                {/* Language */}
                <div className="space-y-3">
                  <div className="space-y-0.5">
                    <Label className="text-base">Language</Label>
                    <p className="text-sm text-muted-foreground">
                      Select your preferred language
                    </p>
                  </div>
                  <Input
                    value="English (US)"
                    disabled
                    className="bg-muted"
                    data-testid="input-language"
                  />
                  <p className="text-xs text-muted-foreground">
                    Additional languages coming soon
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
