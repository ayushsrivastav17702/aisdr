import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

          {(mailbox.provider === "smtp" || mailbox.provider === "gmail" || mailbox.provider === "outlook") && (
            <>
              <div>
                <Label htmlFor="smtpPassword">SMTP Password (optional)</Label>
                <Input
                  id="smtpPassword"
                  type="password"
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
                <Input
                  id="imapPassword"
                  type="password"
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
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<"gmail" | "outlook" | "smtp" | "sendgrid">("smtp");
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
      setShowForm(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to add mailbox", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setEmail("");
    setProvider("smtp");
    setSmtpHost("");
    setSmtpPort("587");
    setSmtpUser("");
    setSmtpPassword("");
    setApiKey("");
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

  if (showForm) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Add Email Mailbox</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Mailbox"
              data-testid="input-mailbox-name"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sender@example.com"
              data-testid="input-mailbox-email"
            />
          </div>
          <div>
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
              <SelectTrigger data-testid="select-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smtp">SMTP</SelectItem>
                <SelectItem value="gmail">Gmail</SelectItem>
                <SelectItem value="outlook">Outlook</SelectItem>
                <SelectItem value="sendgrid">SendGrid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(provider === "smtp" || provider === "gmail" || provider === "outlook") && (
            <>
              <div>
                <Label>SMTP Host</Label>
                <Input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                  data-testid="input-smtp-host"
                />
              </div>
              <div>
                <Label>SMTP Port</Label>
                <Input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  data-testid="input-smtp-port"
                />
              </div>
              <div>
                <Label>SMTP User (optional)</Label>
                <Input
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="Leave blank to use email"
                  data-testid="input-smtp-user"
                />
              </div>
              <div>
                <Label>SMTP Password</Label>
                <Input
                  type="password"
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="input-smtp-password"
                />
              </div>
            </>
          )}

          {provider === "sendgrid" && (
            <div>
              <Label>SendGrid API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="SG.xxxxxxxxxxxxxxxx"
                data-testid="input-api-key"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={!name || !email || createMutation.isPending}
              data-testid="button-create-mailbox"
            >
              {createMutation.isPending ? "Adding..." : "Add Mailbox"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Button onClick={() => setShowForm(true)} data-testid="button-new-mailbox">
      <Plus className="w-4 h-4 mr-2" />
      Add Mailbox
    </Button>
  );
}
