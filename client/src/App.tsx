import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import Dashboard from "@/pages/dashboard";
import Sequences from "@/pages/sequences";
import Mailboxes from "@/pages/mailboxes";
import ContentManagement from "@/pages/content-management";
import AutomationDashboard from "@/pages/AutomationDashboard";
import LoginPage from "@/pages/login";
import AcceptInvitationPage from "@/pages/accept-invitation";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import AdminPanel from "@/pages/admin-panel";
import ProfilePage from "@/pages/profile";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/accept-invitation" component={AcceptInvitationPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
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
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/prospects">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/sequences">
        <ProtectedRoute>
          <Sequences />
        </ProtectedRoute>
      </Route>
      <Route path="/sequences/:id">
        <ProtectedRoute>
          <Sequences />
        </ProtectedRoute>
      </Route>
      <Route path="/mailboxes">
        <ProtectedRoute>
          <Mailboxes />
        </ProtectedRoute>
      </Route>
      <Route path="/content-management">
        <ProtectedRoute>
          <ContentManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/automation-dashboard">
        <ProtectedRoute>
          <AutomationDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/automation">
        <ProtectedRoute>
          <AutomationDashboard />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
