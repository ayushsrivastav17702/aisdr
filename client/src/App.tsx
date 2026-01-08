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
import { CookieConsent } from "@/components/CookieConsent";
import Dashboard from "@/pages/dashboard";
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
        <ProtectedRoute requireAdmin>
          <AdminPanel />
        </ProtectedRoute>
      </Route>
      <Route path="/users">
        <ProtectedRoute requireAdmin>
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
        <ProtectedRoute requireAdmin>
          <OrganizationSettings />
        </ProtectedRoute>
      </Route>
      <Route path="/workspace-management">
        <ProtectedRoute requireAdmin>
          <WorkspaceManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/admin-infrastructure">
        <ProtectedRoute requireAdmin>
          <AdminInfrastructure />
        </ProtectedRoute>
      </Route>
      {/* SDR Routes - blocked for managers */}
      <Route path="/">
        <ProtectedRoute blockManager>
          <SDRDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/ai-search">
        <ProtectedRoute blockManager>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/prospects">
        <ProtectedRoute blockManager>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/sequences">
        <ProtectedRoute blockManager>
          <Sequences />
        </ProtectedRoute>
      </Route>
      <Route path="/sequences/:id">
        <ProtectedRoute blockManager>
          <Sequences />
        </ProtectedRoute>
      </Route>
      <Route path="/mailboxes">
        <ProtectedRoute blockManager>
          <Mailboxes />
        </ProtectedRoute>
      </Route>
      <Route path="/inbox">
        <ProtectedRoute blockManager>
          <InboxPage />
        </ProtectedRoute>
      </Route>
      <Route path="/content-management">
        <ProtectedRoute blockManager>
          <ContentManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/automation-dashboard">
        <ProtectedRoute blockManager>
          <AutomationDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/automation">
        <ProtectedRoute blockManager>
          <AutomationDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute blockManager>
          <AnalyticsPage />
        </ProtectedRoute>
      </Route>
      <Route path="/api-docs">
        <ProtectedRoute requireAdmin>
          <APIDocumentationPage />
        </ProtectedRoute>
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute blockManager>
          <LeaderboardPage />
        </ProtectedRoute>
      </Route>
      <Route path="/my-dashboard">
        <ProtectedRoute blockManager>
          <SDRDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/sdr-dashboard">
        <ProtectedRoute blockManager>
          <SDRDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/best-practices">
        <ProtectedRoute blockManager>
          <BestPracticesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/ae-handoff">
        <ProtectedRoute blockManager>
          <AEHandoffPage />
        </ProtectedRoute>
      </Route>
      <Route path="/ai-prospecting">
        <ProtectedRoute blockManager>
          <AIProspectingPage />
        </ProtectedRoute>
      </Route>
      {/* Campaign Routes - blocked for managers */}
      <Route path="/campaigns">
        <ProtectedRoute blockManager>
          <CampaignDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/campaigns/new">
        <ProtectedRoute blockManager>
          <CreateCampaign />
        </ProtectedRoute>
      </Route>
      {/* Manager Routes - accessible by managers and admins, blocked for regular users */}
      <Route path="/manager/dashboard">
        <ProtectedRoute requireManagerOrAdmin>
          <ManagerDashboard />
        </ProtectedRoute>
      </Route>
      {/* Super Admin Routes - Separate from main app */}
      <Route path="/super-admin/login" component={SuperAdminLogin} />
      <Route path="/super-admin/tenants/new" component={CreateTenant} />
      <Route path="/super-admin/tenants/:id" component={SuperAdminTenantDetail} />
      <Route path="/super-admin" component={SuperAdminDashboard} />
      {/* Public Status Page */}
      <Route path="/status" component={StatusPage} />
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
