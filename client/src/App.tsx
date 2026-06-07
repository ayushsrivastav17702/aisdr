import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { HelpProvider } from "@/contexts/help-context";
import { ProtectedRoute } from "@/components/protected-route";
import { ErrorBoundary } from "@/components/error-boundary";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { OnboardingTooltips } from "@/components/onboarding-tooltips";
import { CookieConsent } from "@/components/CookieConsent";
import Dashboard from "@/pages/dashboard";
import ProspectDetail from "@/pages/prospect-detail";
import Sequences from "@/pages/sequences";
import Mailboxes from "@/pages/mailboxes";
import ContentManagement from "@/pages/content-management";
import AutomationDashboard from "@/pages/AutomationDashboard";
import AnalyticsPage from "@/pages/analytics";
import LoginPage from "@/pages/login";
import MagicAuthPage from "@/pages/magic-auth";
import AcceptInvitationPage from "@/pages/accept-invitation";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import VerifyEmailPage from "@/pages/verify-email";
import AdminPanel from "@/pages/admin-panel";
import ProfilePage from "@/pages/profile";
import SettingsPage from "@/pages/settings";
import OrganizationSettings from "@/pages/organization-settings";
import WorkspaceManagement from "@/pages/workspace-management";
import AdminInfrastructure from "@/pages/admin-infrastructure";
import APIDocumentationPage from "@/pages/api-docs";
import TermsOfServicePage from "@/pages/terms-of-service";
import PrivacyPolicyPage from "@/pages/privacy-policy";
import CookiePolicyPage from "@/pages/cookie-policy";
import DataProcessingAgreementPage from "@/pages/data-processing-agreement";
import SuperAdminLogin from "@/pages/super-admin-login";
import SuperAdminDashboard from "@/pages/super-admin-dashboard";
import SuperAdminTenantDetail from "@/pages/super-admin-tenant-detail";
import LeaderboardPage from "@/pages/leaderboard";
import BestPracticesPage from "@/pages/best-practices";
import AEHandoffPage from "@/pages/ae-handoff";
import AIProspectingPage from "@/pages/ai-prospecting";
import CampaignDashboard from "@/pages/campaign-dashboard";
import CreateCampaign from "@/pages/create-campaign";
import ManagerDashboard from "@/pages/manager-dashboard";
import SDRDashboard from "@/pages/sdr-dashboard";
import CreateTenant from "@/pages/create-tenant";
import StatusPage from "@/pages/status-page";
import InboxPage from "@/pages/inbox";
import UserGuidePage from "@/pages/user-guide";
import HealthDashboard from "@/pages/health-dashboard";
import NotFound from "@/pages/not-found";
import { ImpersonationBanner } from "@/components/impersonation-banner";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/auth/magic" component={MagicAuthPage} />
      <Route path="/accept-invitation" component={AcceptInvitationPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/terms-of-service" component={TermsOfServicePage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/cookie-policy" component={CookiePolicyPage} />
      <Route path="/data-processing-agreement" component={DataProcessingAgreementPage} />
      <Route path="/admin/users">
        <ProtectedRoute requireRole="manager">
          <AdminPanel />
        </ProtectedRoute>
      </Route>
      <Route path="/users">
        <ProtectedRoute requireRole="manager">
          <AdminPanel />
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute>
          <ProfilePage />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/organization-settings">
        <ProtectedRoute requireRole="manager">
          <OrganizationSettings />
        </ProtectedRoute>
      </Route>
      <Route path="/workspace-management">
        <ProtectedRoute requireRole="manager">
          <WorkspaceManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/admin-infrastructure">
        <ProtectedRoute requireRole="manager">
          <AdminInfrastructure />
        </ProtectedRoute>
      </Route>
      {/* SDR Routes - User (SDR) role only */}
      <Route path="/">
        <ProtectedRoute requireRole="user">
          <SDRDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/ai-search">
        <ProtectedRoute requireRole="user">
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/prospects/:id">
        <ProtectedRoute requireRole="user">
          <ProspectDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/prospects">
        <ProtectedRoute requireRole="user">
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/sequences">
        <ProtectedRoute requireRole="user">
          <Sequences />
        </ProtectedRoute>
      </Route>
      <Route path="/sequences/:id">
        <ProtectedRoute requireRole="user">
          <Sequences />
        </ProtectedRoute>
      </Route>
      <Route path="/mailboxes">
        <ProtectedRoute requireRole="user">
          <Mailboxes />
        </ProtectedRoute>
      </Route>
      <Route path="/inbox">
        <ProtectedRoute requireRole="user">
          <InboxPage />
        </ProtectedRoute>
      </Route>
      <Route path="/content-management">
        <ProtectedRoute requireRole="user">
          <ContentManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/automation-dashboard">
        <ProtectedRoute requireRole="user">
          <AutomationDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/automation">
        <ProtectedRoute requireRole="user">
          <AutomationDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute requireRole="user">
          <AnalyticsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/api-docs">
        <ProtectedRoute requireRole="manager">
          <APIDocumentationPage />
        </ProtectedRoute>
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute requireRole="user">
          <LeaderboardPage />
        </ProtectedRoute>
      </Route>
      <Route path="/my-dashboard">
        <ProtectedRoute requireRole="user">
          <SDRDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/sdr-dashboard">
        <ProtectedRoute requireRole="user">
          <SDRDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute requireRole="user">
          <SDRDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/best-practices">
        <ProtectedRoute requireRole="user">
          <BestPracticesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/ae-handoff">
        <ProtectedRoute requireRole="user">
          <AEHandoffPage />
        </ProtectedRoute>
      </Route>
      <Route path="/ai-prospecting">
        <ProtectedRoute requireRole="user">
          <AIProspectingPage />
        </ProtectedRoute>
      </Route>
      {/* Campaign Routes - User (SDR) role only */}
      <Route path="/campaigns">
        <ProtectedRoute requireRole="user">
          <CampaignDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/campaigns/new">
        <ProtectedRoute requireRole="user">
          <CreateCampaign />
        </ProtectedRoute>
      </Route>
      {/* Manager Routes - Manager role only */}
      <Route path="/manager/dashboard">
        <ProtectedRoute requireRole="manager">
          <ManagerDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/manager/health">
        <ProtectedRoute requireRole="manager">
          <HealthDashboard />
        </ProtectedRoute>
      </Route>
      {/* Health Dashboard - accessible by all authenticated users */}
      <Route path="/health">
        <ProtectedRoute>
          <HealthDashboard />
        </ProtectedRoute>
      </Route>
      {/* Super Admin Routes - Separate from main app */}
      <Route path="/super-admin/login" component={SuperAdminLogin} />
      <Route path="/super-admin/tenants/new" component={CreateTenant} />
      <Route path="/super-admin/tenants/:id" component={SuperAdminTenantDetail} />
      <Route path="/super-admin" component={SuperAdminDashboard} />
      {/* Public Status Page */}
      <Route path="/status" component={StatusPage} />
      {/* User Guide - accessible by all authenticated users */}
      <Route path="/user-guide">
        <ProtectedRoute>
          <UserGuidePage />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <HelpProvider>
            <TooltipProvider>
              <Toaster />
              <ImpersonationBanner />
              <OnboardingWizard />
              <OnboardingTooltips />
              <CookieConsent />
              <Router />
            </TooltipProvider>
          </HelpProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
