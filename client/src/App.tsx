import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Sequences from "@/pages/sequences";
import Mailboxes from "@/pages/mailboxes";
import ContentManagement from "@/pages/content-management";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/prospects" component={Dashboard} />
      <Route path="/sequences" component={Sequences} />
      <Route path="/sequences/:id" component={Sequences} />
      <Route path="/mailboxes" component={Mailboxes} />
      <Route path="/content-management" component={ContentManagement} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
