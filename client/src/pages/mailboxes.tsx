import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Mail, Plus, Trash2, Play, Pause, CheckCircle, AlertCircle, Loader2, Settings, ArrowLeft } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { Breadcrumbs } from "@/components/breadcrumbs";

type EmailMailbox = {
  id: string;
  name: string;
  email: string;
  provider: "gmail" | "outlook" | "smtp" | "sendgrid";
  status: "active" | "paused" | "error" | "warming";
  dailyLimit: number;
  dailySent: number;
  warmupStage: number;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpSecure?: boolean;
};

export default function Mailboxes() {
  const { data: mailboxes = [], isLoading } = useQuery<EmailMailbox[]>({
    queryKey: ["/api/mailboxes"],
  });

  const { data: queueStats } = useQuery<{
    pending: number;
    sent: number;
    failed: number;
    sending: number;
  }>({
    queryKey: ["/api/email-queue/stats"],
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto p-6">
        <Breadcrumbs />
        
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" data-testid="text-title">
                Email Mailboxes
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Manage your email sending accounts
              </p>
            </div>
          </div>
          <AddMailboxButton />
        </div>

        {queueStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-pending">{queueStats.pending}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Sending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-sending">{queueStats.sending}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Sent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="stat-sent">{queueStats.sent}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600" data-testid="stat-failed">{queueStats.failed}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : mailboxes.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Mail className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No mailboxes configured</h3>
              <p className="text-gray-500 mb-4">
                Add your first email mailbox to start sending campaigns
              </p>
              <AddMailboxButton />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mailboxes.map((mailbox) => (
              <MailboxCard key={mailbox.id} mailbox={mailbox} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditMailboxDialog({
  mailbox,
  open,
  onOpenChange,
}: {
  mailbox: EmailMailbox;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [dailyLimit, setDailyLimit] = useState(mailbox.dailyLimit.toString());
  const [delayBetweenEmails, setDelayBetweenEmails] = useState("30");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [imapPassword, setImapPassword] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (data: any) =>
      await apiRequest("PATCH", `/api/mailboxes/${mailbox.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailboxes"] });
      toast({ title: "Mailbox updated successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update mailbox", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const updateData: any = {
      dailyLimit: parseInt(dailyLimit),
    };

    if (delayBetweenEmails) {
      updateData.delayBetweenEmails = parseInt(delayBetweenEmails) * 1000;
    }

    if (smtpPassword) {
      updateData.smtpPassword = smtpPassword;
    }

    if (imapPassword) {
      updateData.imapPassword = imapPassword;
    }

    updateMutation.mutate(updateData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-edit-mailbox">
        <DialogHeader>
          <DialogTitle>Edit Mailbox Settings</DialogTitle>
          <DialogDescription>
            Update daily limits and credentials for {mailbox.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="dailyLimit">Daily Sending Limit</Label>
            <Input
              id="dailyLimit"
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              placeholder="500"
              min="1"
              max="10000"
              data-testid="input-daily-limit"
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum emails to send per day (1-10,000)
            </p>
          </div>

          <div>
            <Label htmlFor="delayBetweenEmails">Delay Between Emails (seconds)</Label>
            <Input
              id="delayBetweenEmails"
              type="number"
              value={delayBetweenEmails}
              onChange={(e) => setDelayBetweenEmails(e.target.value)}
              placeholder="30"
              min="5"
              max="300"
              data-testid="input-delay-between-emails"
            />
            <p className="text-xs text-gray-500 mt-1">
              Wait time between emails to avoid spam filters (5-300 seconds)
            </p>
          </div>

          {(mailbox.provider === "smtp" || mailbox.provider === "outlook") && (
            <>
              <div>
                <Label htmlFor="smtpPassword">SMTP Password (optional)</Label>
                <PasswordInput
                  id="smtpPassword"
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  placeholder="Leave empty to keep current"
                  data-testid="input-smtp-password"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Update password for sending emails
                </p>
              </div>

              <div>
                <Label htmlFor="imapPassword">IMAP Password (optional)</Label>
                <PasswordInput
                  id="imapPassword"
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  placeholder="Leave empty to keep current"
                  data-testid="input-imap-password"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Update password for reply detection
                </p>
              </div>
            </>
          )}

          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MailboxCard({ mailbox }: { mailbox: EmailMailbox }) {
  const { toast } = useToast();
  const [showEditDialog, setShowEditDialog] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => await apiRequest("DELETE", `/api/mailboxes/${mailbox.id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailboxes"] });
      toast({ title: "Mailbox deleted" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) =>
      await apiRequest("PUT", `/api/mailboxes/${mailbox.id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailboxes"] });
      toast({ title: "Status updated" });
    },
  });

  const statusColor = {
    active: "bg-green-100 text-green-800",
    paused: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800",
    warming: "bg-blue-100 text-blue-800",
  }[mailbox.status];

  return (
    <Card data-testid={`mailbox-card-${mailbox.id}`}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg" data-testid={`mailbox-name-${mailbox.id}`}>
              {mailbox.name}
            </CardTitle>
            <CardDescription data-testid={`mailbox-email-${mailbox.id}`}>
              {mailbox.email}
            </CardDescription>
          </div>
          <Badge className={statusColor} data-testid={`mailbox-status-${mailbox.id}`}>
            {mailbox.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Provider:</span>
            <span className="font-medium uppercase">{mailbox.provider}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Daily Limit:</span>
            <span className="font-medium">{mailbox.dailyLimit}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Sent Today:</span>
            <span className="font-medium">{mailbox.dailySent}</span>
          </div>
          {mailbox.warmupStage > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Warmup Stage:</span>
              <span className="font-medium">{mailbox.warmupStage}/5</span>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            {mailbox.status === "active" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatusMutation.mutate("paused")}
                disabled={updateStatusMutation.isPending}
                data-testid={`button-pause-${mailbox.id}`}
              >
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatusMutation.mutate("active")}
                disabled={updateStatusMutation.isPending}
                data-testid={`button-activate-${mailbox.id}`}
              >
                <Play className="w-4 h-4 mr-1" />
                Activate
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowEditDialog(true)}
              data-testid={`button-edit-${mailbox.id}`}
            >
              <Settings className="w-4 h-4 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid={`button-delete-${mailbox.id}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
      <EditMailboxDialog
        mailbox={mailbox}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
    </Card>
  );
}

function AddMailboxButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<"gmail" | "outlook" | "smtp" | "sendgrid">("gmail");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: any) => await apiRequest("POST", "/api/mailboxes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailboxes"] });
      toast({ title: "Mailbox added successfully" });
      setOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to add mailbox", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setEmail("");
    setProvider("gmail");
    setSmtpHost("");
    setSmtpPort("587");
    setSmtpUser("");
    setSmtpPassword("");
    setApiKey("");
  };

  const handleProviderChange = (value: string) => {
    setProvider(value as any);
    if (value === "gmail") {
      setSmtpHost("smtp.gmail.com");
      setSmtpPort("465");
    } else if (value === "outlook") {
      setSmtpHost("smtp.office365.com");
      setSmtpPort("587");
    } else {
      setSmtpHost("");
      setSmtpPort("587");
    }
  };

  const handleSubmit = () => {
    const data: any = {
      name,
      email,
      provider,
    };

    if (provider === "smtp" || provider === "gmail" || provider === "outlook") {
      data.smtpHost = smtpHost;
      data.smtpPort = parseInt(smtpPort);
      data.smtpUser = smtpUser || email;
      data.smtpPassword = smtpPassword;
      data.smtpSecure = true;
    } else if (provider === "sendgrid") {
      data.apiKey = apiKey;
    }

    createMutation.mutate(data);
  };

  const providerHints: Record<string, { host: string; port: string; tip: string }> = {
    gmail: {
      host: "smtp.gmail.com",
      port: "465",
      tip: "Connect with Google OAuth below — no app password required."
    },
    outlook: {
      host: "smtp.office365.com", 
      port: "587",
      tip: "Use your Microsoft account password or an App Password if 2FA is enabled"
    },
    smtp: {
      host: "",
      port: "587",
      tip: "Enter your custom SMTP server details"
    },
    sendgrid: {
      host: "",
      port: "",
      tip: "Get your API key from SendGrid dashboard → Settings → API Keys"
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-mailbox">
          <Plus className="w-4 h-4 mr-2" />
          Add Mailbox
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-add-mailbox">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Add Email Mailbox
          </DialogTitle>
          <DialogDescription>
            Connect your email account to send campaigns. We support Gmail, Outlook, and custom SMTP servers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Display Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sales Outreach"
                className="h-10"
                data-testid="input-mailbox-name"
              />
              <p className="text-xs text-muted-foreground">A friendly name for this mailbox</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-10"
                data-testid="input-mailbox-email"
              />
              <p className="text-xs text-muted-foreground">The email you'll send from</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Email Provider</Label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: "gmail", label: "Gmail", icon: "📧" },
                { value: "outlook", label: "Outlook", icon: "📬" },
                { value: "smtp", label: "SMTP", icon: "⚙️" },
                { value: "sendgrid", label: "SendGrid", icon: "📨" },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handleProviderChange(p.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    provider === p.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                  data-testid={`provider-${p.value}`}
                >
                  <span className="text-xl">{p.icon}</span>
                  <span className="text-xs font-medium">{p.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 bg-blue-50 dark:bg-blue-950/30 p-2 rounded-md border border-blue-100 dark:border-blue-900">
              💡 {providerHints[provider].tip}
            </p>
          </div>

          {provider === "gmail" && (
            <div className="space-y-3 pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                Connect your Gmail account securely using Google OAuth. No password needed.
              </p>

              <button
                type="button"
                onClick={() => {
                  window.location.href = "/api/mailboxes/oauth/gmail/connect";
                }}
                data-testid="btn-connect-gmail-oauth"
                className="w-full flex items-center justify-center gap-3 h-10 rounded-md border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 font-medium text-sm transition-all"
              >
                <GoogleIcon className="w-4 h-4" />
                Connect Gmail with Google
              </button>

              <p className="text-xs text-muted-foreground">
                You will be redirected to Google to authorize access.
              </p>
            </div>
          )}

          {(provider === "smtp" || provider === "outlook") && (
            <div className="space-y-4 pt-2 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">Server Settings</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="smtpHost" className="text-sm">SMTP Host</Label>
                  <Input
                    id="smtpHost"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.example.com"
                    className="h-10"
                    data-testid="input-smtp-host"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPort" className="text-sm">Port</Label>
                  <Input
                    id="smtpPort"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587"
                    className="h-10"
                    data-testid="input-smtp-port"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtpUser" className="text-sm">Username (optional)</Label>
                  <Input
                    id="smtpUser"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="Uses email if blank"
                    className="h-10"
                    data-testid="input-smtp-user"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtpPassword" className="text-sm">
                    Password
                  </Label>
                  <PasswordInput
                    id="smtpPassword"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="h-10"
                    data-testid="input-smtp-password"
                  />
                </div>
              </div>
            </div>
          )}

          {provider === "sendgrid" && (
            <div className="space-y-4 pt-2 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">API Configuration</h4>
              <div className="space-y-2">
                <Label htmlFor="apiKey" className="text-sm">SendGrid API Key</Label>
                <PasswordInput
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="SG.xxxxxxxxxxxxxxxx"
                  className="h-10"
                  data-testid="input-api-key"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          {provider !== "gmail" && (
          <Button
            onClick={handleSubmit}
            disabled={!name || !email || createMutation.isPending}
            data-testid="button-create-mailbox"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Add Mailbox
              </>
            )}
          </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.28 1.48-1.13 2.73-2.41 3.58v2.97h3.91c2.29-2.11 3.55-5.21 3.55-8.79z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.91-2.97c-1.07.72-2.43 1.15-4.02 1.15-3.1 0-5.72-2.09-6.66-4.9H1.27v3.07C3.24 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.34 14.38a7.16 7.16 0 0 1 0-4.76V6.55H1.27a11.99 11.99 0 0 0 0 10.9l4.07-3.07z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.46-3.46C17.94 1.18 15.24 0 12 0 7.31 0 3.24 2.7 1.27 6.55l4.07 3.07c.94-2.81 3.56-4.87 6.66-4.87z"
      />
    </svg>
  );
}
