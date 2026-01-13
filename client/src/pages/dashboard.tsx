import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import AISearch from "@/components/ai-search";
import ProspectsTable from "@/components/prospects-table";
import ImportWizard from "@/components/import-wizard";
import JobDrawer from "@/components/job-drawer";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { Link, useLocation } from "wouter";
import { 
  BrainIcon, 
  UsersIcon, 
  UploadIcon, 
  SparklesIcon, 
  BarChart3Icon, 
  SettingsIcon,
  ListTodo,
  PlusIcon,
  Mail,
  Inbox,
  FileText,
  Zap,
  Shield,
  Code,
  Building2,
  FolderTree,
  LogOut,
  User as UserIcon,
  Trophy,
  BookOpen,
  ArrowRightLeft
} from "lucide-react";
import { HelpTooltip } from "@/components/HelpTooltip";
import { QuotaBar } from "@/components/quota-bar";

export default function Dashboard() {
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Get active jobs for the jobs button badge
  const { data: activeJobs = [] } = useQuery<any[]>({
    queryKey: ["/api/jobs/active"],
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const activeJobsCount = activeJobs.length;

  const handleEnrichmentClick = () => {
    toast({
      title: "Enrichment Features",
      description: "Select prospects below and use the 'Get Emails (Lusha)' or 'Enrich Selected' buttons to enrich your data.",
    });
  };



  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar Navigation */}
      <aside className="w-60 bg-card border-r border-border flex flex-col flex-shrink-0">
        {/* Logo & Brand */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <BrainIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold" data-testid="app-title">AISDR</h1>
              <p className="text-xs text-muted-foreground">AI Sales Platform</p>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-4 space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 bg-primary/10 text-primary hover:bg-primary/20"
            data-testid="nav-ai-search"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>AI Search</span>
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => toast({
              title: "Prospects",
              description: "You're viewing the prospects section below the search.",
            })}
            data-testid="nav-prospects"
          >
            <UsersIcon className="w-4 h-4" />
            <span>Prospects</span>
            <Badge variant="secondary" className="ml-auto text-xs">
              {/* This would show total prospect count */}
            </Badge>
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setIsImportWizardOpen(true)}
            data-testid="nav-import"
          >
            <UploadIcon className="w-4 h-4" />
            <span>Import</span>
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/sequences")}
            data-testid="nav-sequences"
          >
            <Mail className="w-4 h-4" />
            <span>Sequences</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/automation-dashboard")}
            data-testid="nav-automation"
          >
            <Zap className="w-4 h-4" />
            <span>Automation</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/mailboxes")}
            data-testid="nav-mailboxes"
          >
            <Inbox className="w-4 h-4" />
            <span>Mailboxes</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/content-management")}
            data-testid="nav-content"
          >
            <FileText className="w-4 h-4" />
            <span>Content</span>
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={handleEnrichmentClick}
            data-testid="nav-enrichment"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>Enrichment</span>
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/my-dashboard")}
            data-testid="nav-my-dashboard"
          >
            <BarChart3Icon className="w-4 h-4" />
            <span>My Dashboard</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/analytics")}
            data-testid="nav-analytics"
          >
            <BarChart3Icon className="w-4 h-4" />
            <span>Analytics</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/leaderboard")}
            data-testid="nav-leaderboard"
          >
            <Trophy className="w-4 h-4" />
            <span>Leaderboard</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/best-practices")}
            data-testid="nav-best-practices"
          >
            <BookOpen className="w-4 h-4" />
            <span>Best Practices</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/ae-handoff")}
            data-testid="nav-ae-handoff"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>AE Handoff</span>
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/ai-prospecting")}
            data-testid="nav-ai-prospecting"
          >
            <SparklesIcon className="w-4 h-4" />
            <span>AI Prospecting</span>
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/api-docs")}
            data-testid="nav-api-docs"
          >
            <Code className="w-4 h-4" />
            <span>API Docs</span>
          </Button>
          
          <Separator className="my-4" />
          
          {user?.role === 'admin' && (
            <>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
                onClick={() => setLocation("/users")}
                data-testid="nav-users"
              >
                <Shield className="w-4 h-4" />
                <span>User Management</span>
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
                onClick={() => setLocation("/organization-settings")}
                data-testid="nav-org-settings"
              >
                <Building2 className="w-4 h-4" />
                <span>Organization</span>
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
                onClick={() => setLocation("/workspace-management")}
                data-testid="nav-workspaces"
              >
                <FolderTree className="w-4 h-4" />
                <span>Workspaces</span>
              </Button>
            </>
          )}
          
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
            onClick={() => setLocation("/settings")}
            data-testid="nav-settings"
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Settings</span>
          </Button>
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-border space-y-2">
          <div 
            className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted cursor-pointer transition-colors" 
            data-testid="link-user-profile"
            onClick={() => setLocation("/profile")}
          >
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-medium">
              {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" data-testid="text-user-name">
                {user?.firstName || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
                {user?.email || 'user@company.com'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-auto">
        {/* Quota Bar - Persistent visibility */}
        <QuotaBar />
        
        {/* Email Verification Banner */}
        <div className="px-8 pt-4">
          <EmailVerificationBanner />
        </div>
        
        {/* Top Header Bar */}
        <header className="h-16 border-b border-border bg-card px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold" data-testid="page-title">AI Prospect Search</h2>
              <HelpTooltip moduleId="dashboard" itemId="ai-search" />
            </div>
            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
              <SparklesIcon className="w-3 h-3 mr-1" />
              AI Powered
            </Badge>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="relative"
              onClick={() => setIsJobDrawerOpen(true)}
              data-testid="button-jobs"
            >
              <ListTodo className="w-4 h-4 mr-2" />
              Jobs
              {activeJobsCount > 0 && (
                <Badge variant="default" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs rounded-full">
                  {activeJobsCount}
                </Badge>
              )}
            </Button>
            
            <Button
              onClick={() => setIsImportWizardOpen(true)}
              data-testid="button-new-import"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              New Import
            </Button>
          </div>
        </header>

        {/* AI Search Interface */}
        <AISearch />

        {/* Search Results Section */}
        <div className="flex-1 overflow-auto">
          <ProspectsTable 
            selectedIds={selectedProspectIds}
            onSelectionChange={setSelectedProspectIds}
          />
        </div>
      </main>

      {/* Import Wizard Modal */}
      <ImportWizard 
        open={isImportWizardOpen}
        onClose={() => setIsImportWizardOpen(false)}
      />

      {/* Job Status Drawer */}
      <JobDrawer 
        open={isJobDrawerOpen}
        onClose={() => setIsJobDrawerOpen(false)}
      />
    </div>
  );
}
