import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Building2,
  User,
  Settings,
  Shield
} from "lucide-react";

interface TenantFormData {
  companyName: string;
  subdomain: string;
  industry: string;
  companySize: string;
  planType: string;
  maxUsers: number;
  maxMailboxes: number;
  dailySendLimit: number;
  managerEmail: string;
  managerFirstName: string;
  managerLastName: string;
  managerPassword: string;
  features: {
    aiProspecting: boolean;
    aiEmailGeneration: boolean;
    advancedAnalytics: boolean;
    multiMailbox: boolean;
    webhookAccess: boolean;
  };
}

const steps = [
  { id: 1, title: "Company Details", icon: Building2 },
  { id: 2, title: "Plan & Limits", icon: Settings },
  { id: 3, title: "Manager Account", icon: User },
  { id: 4, title: "Review & Create", icon: Check },
];

async function superAdminFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('super_admin_token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }
  return res.json();
}

export default function CreateTenant() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const { toast } = useToast();

  const [formData, setFormData] = useState<TenantFormData>({
    companyName: "",
    subdomain: "",
    industry: "",
    companySize: "",
    planType: "starter",
    maxUsers: 5,
    maxMailboxes: 3,
    dailySendLimit: 500,
    managerEmail: "",
    managerFirstName: "",
    managerLastName: "",
    managerPassword: "",
    features: {
      aiProspecting: true,
      aiEmailGeneration: true,
      advancedAnalytics: false,
      multiMailbox: false,
      webhookAccess: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TenantFormData) => {
      return await superAdminFetch("/api/super-admin/tenants", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Tenant created",
        description: "The new tenant has been created successfully.",
      });
      setLocation("/super-admin/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create tenant",
        variant: "destructive",
      });
    },
  });

  const handleNext = () => {
    if (currentStep === 1 && !formData.companyName) {
      toast({
        title: "Missing information",
        description: "Please enter a company name",
        variant: "destructive",
      });
      return;
    }
    if (currentStep === 3 && (!formData.managerEmail || !formData.managerPassword)) {
      toast({
        title: "Missing information",
        description: "Please enter manager email and password",
        variant: "destructive",
      });
      return;
    }
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      setLocation("/super-admin/dashboard");
    }
  };

  const handleSubmit = () => {
    createMutation.mutate(formData);
  };

  const generateSubdomain = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Super Admin</h1>
            <p className="text-xs text-muted-foreground">Create New Tenant</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <Button variant="ghost" onClick={handleBack} className="mb-4" data-testid="btn-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold" data-testid="page-title">Create New Tenant</h1>
          <p className="text-muted-foreground">Set up a new organization on the platform</p>
        </div>

        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  currentStep >= step.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
                data-testid={`step-indicator-${step.id}`}
              >
                <step.icon className="w-5 h-5" />
              </div>
              <div className="ml-3 hidden sm:block">
                <p className={`text-sm font-medium ${currentStep >= step.id ? "" : "text-muted-foreground"}`}>
                  Step {step.id}
                </p>
                <p className={`text-xs ${currentStep >= step.id ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                  {step.title}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-16 h-0.5 mx-4 ${currentStep > step.id ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    placeholder="Acme Corporation"
                    value={formData.companyName}
                    onChange={(e) => {
                      const name = e.target.value;
                      setFormData({
                        ...formData,
                        companyName: name,
                        subdomain: formData.subdomain || generateSubdomain(name)
                      });
                    }}
                    data-testid="input-company-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subdomain">Subdomain</Label>
                  <div className="flex items-center">
                    <Input
                      id="subdomain"
                      placeholder="acme"
                      value={formData.subdomain}
                      onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                      data-testid="input-subdomain"
                    />
                    <span className="ml-2 text-muted-foreground">.aisdr.io</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select
                      value={formData.industry}
                      onValueChange={(value) => setFormData({ ...formData, industry: value })}
                    >
                      <SelectTrigger data-testid="select-industry">
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="technology">Technology</SelectItem>
                        <SelectItem value="saas">SaaS</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="manufacturing">Manufacturing</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companySize">Company Size</Label>
                    <Select
                      value={formData.companySize}
                      onValueChange={(value) => setFormData({ ...formData, companySize: value })}
                    >
                      <SelectTrigger data-testid="select-company-size">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-10">1-10 employees</SelectItem>
                        <SelectItem value="11-50">11-50 employees</SelectItem>
                        <SelectItem value="51-200">51-200 employees</SelectItem>
                        <SelectItem value="201-500">201-500 employees</SelectItem>
                        <SelectItem value="500+">500+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="planType">Plan Type</Label>
                  <Select
                    value={formData.planType}
                    onValueChange={(value) => setFormData({ ...formData, planType: value })}
                  >
                    <SelectTrigger data-testid="select-plan-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxUsers">Max Users</Label>
                    <Input
                      id="maxUsers"
                      type="number"
                      min="1"
                      value={formData.maxUsers}
                      onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) || 5 })}
                      data-testid="input-max-users"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxMailboxes">Max Mailboxes</Label>
                    <Input
                      id="maxMailboxes"
                      type="number"
                      min="1"
                      value={formData.maxMailboxes}
                      onChange={(e) => setFormData({ ...formData, maxMailboxes: parseInt(e.target.value) || 3 })}
                      data-testid="input-max-mailboxes"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dailySendLimit">Daily Email Limit</Label>
                    <Input
                      id="dailySendLimit"
                      type="number"
                      min="100"
                      value={formData.dailySendLimit}
                      onChange={(e) => setFormData({ ...formData, dailySendLimit: parseInt(e.target.value) || 500 })}
                      data-testid="input-daily-limit"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-medium">Feature Flags</h3>
                  {Object.entries(formData.features).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <Label htmlFor={key} className="capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Label>
                      <Switch
                        id={key}
                        checked={value}
                        onCheckedChange={(checked) =>
                          setFormData({
                            ...formData,
                            features: { ...formData.features, [key]: checked }
                          })
                        }
                        data-testid={`switch-${key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <p className="text-muted-foreground">
                  Create the primary manager account for this tenant. They will receive login credentials.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="managerEmail">Manager Email</Label>
                  <Input
                    id="managerEmail"
                    type="email"
                    placeholder="manager@company.com"
                    value={formData.managerEmail}
                    onChange={(e) => setFormData({ ...formData, managerEmail: e.target.value })}
                    data-testid="input-manager-email"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="managerFirstName">First Name</Label>
                    <Input
                      id="managerFirstName"
                      placeholder="John"
                      value={formData.managerFirstName}
                      onChange={(e) => setFormData({ ...formData, managerFirstName: e.target.value })}
                      data-testid="input-manager-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="managerLastName">Last Name</Label>
                    <Input
                      id="managerLastName"
                      placeholder="Doe"
                      value={formData.managerLastName}
                      onChange={(e) => setFormData({ ...formData, managerLastName: e.target.value })}
                      data-testid="input-manager-last-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="managerPassword">Temporary Password</Label>
                  <Input
                    id="managerPassword"
                    type="password"
                    placeholder="Enter a temporary password"
                    value={formData.managerPassword}
                    onChange={(e) => setFormData({ ...formData, managerPassword: e.target.value })}
                    data-testid="input-manager-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    The manager will be prompted to change this on first login.
                  </p>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Review Tenant Details</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Company Name</p>
                    <p className="font-medium" data-testid="review-company">{formData.companyName || "-"}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Subdomain</p>
                    <p className="font-medium" data-testid="review-subdomain">{formData.subdomain || "-"}.aisdr.io</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Plan</p>
                    <p className="font-medium capitalize" data-testid="review-plan">{formData.planType}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Max Users</p>
                    <p className="font-medium" data-testid="review-max-users">{formData.maxUsers}</p>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Manager Account</p>
                  <p className="font-medium" data-testid="review-manager">
                    {formData.managerFirstName} {formData.managerLastName}
                  </p>
                  <p className="text-sm text-muted-foreground">{formData.managerEmail}</p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Enabled Features</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(formData.features)
                      .filter(([, v]) => v)
                      .map(([key]) => (
                        <span key={key} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={handleBack} data-testid="btn-previous">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {currentStep === 1 ? "Cancel" : "Previous"}
          </Button>

          {currentStep < 4 ? (
            <Button onClick={handleNext} data-testid="btn-next">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="btn-create-tenant">
              {createMutation.isPending ? "Creating..." : "Create Tenant"}
              <Check className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
