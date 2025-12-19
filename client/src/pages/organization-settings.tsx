import { useState, useEffect } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Building2, 
  Globe, 
  Palette, 
  Settings, 
  Users, 
  Calendar,
  ArrowLeft,
  Save,
  Loader2,
  Building,
  MapPin,
  Phone,
  Mail
} from 'lucide-react';
import { Link } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  brandingColors: {
    primary?: string;
    secondary?: string;
    accent?: string;
  } | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  industry: string | null;
  companySize: string | null;
  website: string | null;
  phone: string | null;
  timezone: string | null;
  language: string | null;
  fiscalYearStart: number | null;
  reportingPeriod: string | null;
  preferences: {
    emailSignature?: string;
    defaultSenderName?: string;
    notificationsEnabled?: boolean;
    weeklyReports?: boolean;
    dataRetentionDays?: number;
  } | null;
  status: 'active' | 'suspended' | 'archived';
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrgStats {
  workspaces: number;
  members: number;
}

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
  'Asia/Kolkata', 'Australia/Sydney'
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
];

const COMPANY_SIZES = [
  '1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'
];

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
  'Retail', 'Real Estate', 'Media', 'Professional Services', 'Other'
];

const REPORTING_PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

export default function OrganizationSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState<Partial<Organization>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const { data: organizations, isLoading: isLoadingOrgs } = useQuery<Organization[]>({
    queryKey: ['/api/organizations'],
  });

  const currentOrg = organizations?.[0];

  const { data: stats } = useQuery<OrgStats>({
    queryKey: ['/api/organizations', currentOrg?.id, 'stats'],
    enabled: !!currentOrg?.id,
  });

  useEffect(() => {
    if (currentOrg) {
      setFormData(currentOrg);
    }
  }, [currentOrg]);

  const updateOrgMutation = useMutation({
    mutationFn: async (data: Partial<Organization>) => {
      const response = await apiRequest('PATCH', `/api/organizations/${currentOrg?.id}`, data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update organization');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Settings saved',
        description: 'Organization settings have been updated successfully.',
      });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to save settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createOrgMutation = useMutation({
    mutationFn: async (data: Partial<Organization>) => {
      const response = await apiRequest('POST', '/api/organizations', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create organization');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Organization created',
        description: 'Your organization has been set up successfully.',
      });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/organizations'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create organization',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleInputChange = (field: keyof Organization, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handlePreferenceChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      preferences: { ...(prev.preferences ?? {}), [field]: value }
    }));
    setHasChanges(true);
  };

  const handleBrandingChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      brandingColors: { ...(prev.brandingColors ?? {}), [field]: value }
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (currentOrg) {
      updateOrgMutation.mutate(formData);
    } else {
      createOrgMutation.mutate(formData);
    }
  };

  if (isLoadingOrgs) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-organization-settings">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-page-title">Organization Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage your organization's profile, branding, and preferences
              </p>
            </div>
          </div>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || updateOrgMutation.isPending || createOrgMutation.isPending}
            data-testid="button-save-settings"
          >
            {(updateOrgMutation.isPending || createOrgMutation.isPending) ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Building className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-workspace-count">{stats.workspaces}</p>
                  <p className="text-sm text-muted-foreground">Workspaces</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-member-count">{stats.members}</p>
                  <p className="text-sm text-muted-foreground">Team Members</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="gap-2" data-testid="tab-general">
              <Building2 className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="branding" className="gap-2" data-testid="tab-branding">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="regional" className="gap-2" data-testid="tab-regional">
              <Globe className="h-4 w-4" />
              Regional
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2" data-testid="tab-preferences">
              <Settings className="h-4 w-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Information</CardTitle>
                <CardDescription>Basic information about your organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Organization Name</Label>
                    <Input
                      id="name"
                      value={formData.name || ''}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Acme Corporation"
                      data-testid="input-org-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.website || ''}
                      onChange={(e) => handleInputChange('website', e.target.value)}
                      placeholder="https://example.com"
                      data-testid="input-website"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select
                      value={formData.industry || ''}
                      onValueChange={(value) => handleInputChange('industry', value)}
                    >
                      <SelectTrigger data-testid="select-industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((industry) => (
                          <SelectItem key={industry} value={industry}>
                            {industry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companySize">Company Size</Label>
                    <Select
                      value={formData.companySize || ''}
                      onValueChange={(value) => handleInputChange('companySize', value)}
                    >
                      <SelectTrigger data-testid="select-company-size">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMPANY_SIZES.map((size) => (
                          <SelectItem key={size} value={size}>
                            {size} employees
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={formData.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    data-testid="input-phone"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Address
                </CardTitle>
                <CardDescription>Organization's physical address</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={formData.address || ''}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    placeholder="123 Main Street"
                    data-testid="input-address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city || ''}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="San Francisco"
                      data-testid="input-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State/Province</Label>
                    <Input
                      id="state"
                      value={formData.state || ''}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      placeholder="California"
                      data-testid="input-state"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={formData.country || ''}
                      onChange={(e) => handleInputChange('country', e.target.value)}
                      placeholder="United States"
                      data-testid="input-country"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input
                      id="postalCode"
                      value={formData.postalCode || ''}
                      onChange={(e) => handleInputChange('postalCode', e.target.value)}
                      placeholder="94102"
                      data-testid="input-postal-code"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Logo & Branding</CardTitle>
                <CardDescription>Customize your organization's visual identity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="logo">Logo URL</Label>
                  <Input
                    id="logo"
                    value={formData.logo || ''}
                    onChange={(e) => handleInputChange('logo', e.target.value)}
                    placeholder="https://example.com/logo.png"
                    data-testid="input-logo"
                  />
                  {formData.logo && (
                    <div className="mt-2 p-4 border rounded-lg">
                      <img 
                        src={formData.logo} 
                        alt="Organization logo" 
                        className="max-h-16 object-contain"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <Label>Brand Colors</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor" className="text-xs">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          type="color"
                          value={formData.brandingColors?.primary || '#3b82f6'}
                          onChange={(e) => handleBrandingChange('primary', e.target.value)}
                          className="w-12 h-10 p-1 cursor-pointer"
                          data-testid="input-color-primary"
                        />
                        <Input
                          value={formData.brandingColors?.primary || '#3b82f6'}
                          onChange={(e) => handleBrandingChange('primary', e.target.value)}
                          className="flex-1"
                          data-testid="input-color-primary-hex"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor" className="text-xs">Secondary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondaryColor"
                          type="color"
                          value={formData.brandingColors?.secondary || '#64748b'}
                          onChange={(e) => handleBrandingChange('secondary', e.target.value)}
                          className="w-12 h-10 p-1 cursor-pointer"
                          data-testid="input-color-secondary"
                        />
                        <Input
                          value={formData.brandingColors?.secondary || '#64748b'}
                          onChange={(e) => handleBrandingChange('secondary', e.target.value)}
                          className="flex-1"
                          data-testid="input-color-secondary-hex"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accentColor" className="text-xs">Accent Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="accentColor"
                          type="color"
                          value={formData.brandingColors?.accent || '#10b981'}
                          onChange={(e) => handleBrandingChange('accent', e.target.value)}
                          className="w-12 h-10 p-1 cursor-pointer"
                          data-testid="input-color-accent"
                        />
                        <Input
                          value={formData.brandingColors?.accent || '#10b981'}
                          onChange={(e) => handleBrandingChange('accent', e.target.value)}
                          className="flex-1"
                          data-testid="input-color-accent-hex"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="regional" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Regional Settings</CardTitle>
                <CardDescription>Configure time zone, language, and fiscal settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Time Zone</Label>
                    <Select
                      value={formData.timezone || 'UTC'}
                      onValueChange={(value) => handleInputChange('timezone', value)}
                    >
                      <SelectTrigger data-testid="select-timezone">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="language">Default Language</Label>
                    <Select
                      value={formData.language || 'en'}
                      onValueChange={(value) => handleInputChange('language', value)}
                    >
                      <SelectTrigger data-testid="select-language">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fiscalYearStart">Fiscal Year Start Month</Label>
                    <Select
                      value={String(formData.fiscalYearStart || 1)}
                      onValueChange={(value) => handleInputChange('fiscalYearStart', parseInt(value))}
                    >
                      <SelectTrigger data-testid="select-fiscal-year">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        {['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {month}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reportingPeriod">Reporting Period</Label>
                    <Select
                      value={formData.reportingPeriod || 'monthly'}
                      onValueChange={(value) => handleInputChange('reportingPeriod', value)}
                    >
                      <SelectTrigger data-testid="select-reporting-period">
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORTING_PERIODS.map((period) => (
                          <SelectItem key={period.value} value={period.value}>
                            {period.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Preferences</CardTitle>
                <CardDescription>Configure email and notification settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultSenderName">Default Sender Name</Label>
                  <Input
                    id="defaultSenderName"
                    value={formData.preferences?.defaultSenderName || ''}
                    onChange={(e) => handlePreferenceChange('defaultSenderName', e.target.value)}
                    placeholder="Sales Team"
                    data-testid="input-sender-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emailSignature">Default Email Signature</Label>
                  <Textarea
                    id="emailSignature"
                    value={formData.preferences?.emailSignature || ''}
                    onChange={(e) => handlePreferenceChange('emailSignature', e.target.value)}
                    placeholder="Best regards,\nThe Sales Team"
                    rows={4}
                    data-testid="input-email-signature"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dataRetentionDays">Data Retention (Days)</Label>
                  <Input
                    id="dataRetentionDays"
                    type="number"
                    value={formData.preferences?.dataRetentionDays || 365}
                    onChange={(e) => handlePreferenceChange('dataRetentionDays', parseInt(e.target.value))}
                    placeholder="365"
                    data-testid="input-data-retention"
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of days to retain prospect and email data
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
