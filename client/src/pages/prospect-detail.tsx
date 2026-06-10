import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import {
  ArrowLeftIcon,
  MailIcon,
  PhoneIcon,
  LinkedinIcon,
  BuildingIcon,
  MapPinIcon,
  BriefcaseIcon,
  SparklesIcon,
  GitBranchIcon,
  TagIcon,
  ActivityIcon,
  FileTextIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  ClockIcon,
  PauseCircleIcon,
  Trash2Icon,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(first?: string, last?: string) {
  return `${(first || "?")[0]}${(last || "")[0] || ""}`.toUpperCase();
}

function statusColor(status: string) {
  switch (status) {
    case "active": return "text-green-600 border-green-300 bg-green-50";
    case "completed": return "text-blue-600 border-blue-300 bg-blue-50";
    case "paused": return "text-yellow-600 border-yellow-300 bg-yellow-50";
    default: return "text-muted-foreground border-border bg-muted";
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "active") return <CheckCircleIcon className="w-4 h-4 text-green-500" />;
  if (status === "completed") return <CheckCircleIcon className="w-4 h-4 text-blue-500" />;
  if (status === "paused") return <PauseCircleIcon className="w-4 h-4 text-yellow-500" />;
  return <ClockIcon className="w-4 h-4 text-muted-foreground" />;
}

// ─── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ prospect }: { prospect: any }) {
  const { toast } = useToast();

  // P1 FIX 6: Manual AE Handoff from prospect profile
  const createHandoffMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/handoffs", {
        prospectId: prospect.id,
        handoffReason: "manual_sdr_handoff",
        handoffNotes: `Manually handed off from prospect profile on ${new Date().toLocaleDateString()}.`,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Handed off to AE", description: "This prospect has been sent to the AE queue." });
    },
    onError: (error: Error) => {
      toast({
        title: "Handoff failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => createHandoffMutation.mutate()}
          disabled={createHandoffMutation.isPending}
          data-testid="button-handoff-to-ae"
        >
          {createHandoffMutation.isPending ? "Handing off..." : "🤝 Hand off to AE"}
        </Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Contact Information</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <MailIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className={`text-sm ${prospect.primaryEmail ? "" : "text-orange-500"}`}>
                {prospect.primaryEmail || "Not found — try enriching"}
              </p>
            </div>
          </div>
          {prospect.phoneNumber && (
            <div className="flex items-start gap-3">
              <PhoneIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm">{prospect.phoneNumber}</p>
              </div>
            </div>
          )}
          {prospect.linkedinUrl && (
            <div className="flex items-start gap-3">
              <LinkedinIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">LinkedIn</p>
                <a
                  href={prospect.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline break-all"
                >
                  {prospect.linkedinUrl}
                </a>
              </div>
            </div>
          )}
          {(prospect.contactLocation || prospect.companyLocation) && (
            <div className="flex items-start gap-3">
              <MapPinIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="text-sm">{prospect.contactLocation || prospect.companyLocation}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Professional</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <BriefcaseIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Job title</p>
              <p className="text-sm">{prospect.jobTitle || "—"}</p>
              {prospect.seniority && <Badge variant="outline" className="mt-1 text-xs">{prospect.seniority}</Badge>}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <BuildingIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Company</p>
              <p className="text-sm">{prospect.companyName || "—"}</p>
              {prospect.companySize && <p className="text-xs text-muted-foreground">{prospect.companySize} employees</p>}
              {prospect.companyIndustry && <Badge variant="outline" className="mt-1 text-xs">{prospect.companyIndustry}</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {prospect.tags && prospect.tags.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Tags</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {prospect.tags.map((tag: string) => (
                <Badge key={tag} variant="secondary">
                  <TagIcon className="w-3 h-3 mr-1" />{tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Notes tab ───────────────────────────────────────────────────────────────

function formatNoteDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function NotesTab({ prospectId, currentUserId }: { prospectId: string; currentUserId: string }) {
  const [noteInput, setNoteInput] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ notes: any[] }>({
    queryKey: ["/api/prospects", prospectId, "notes"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/prospects/${prospectId}/notes`);
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/prospects/${prospectId}/notes`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospects", prospectId, "notes"] });
      setNoteInput("");
      toast({ title: "Note saved" });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Failed to save note", description: err?.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      await apiRequest("DELETE", `/api/prospects/${prospectId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospects", prospectId, "notes"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Failed to delete note", description: err?.message });
    },
  });

  const notes = data?.notes ?? [];

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="space-y-2">
        <Textarea
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          data-testid="notes-textarea"
        />
        <Button
          size="sm"
          onClick={() => saveMutation.mutate(noteInput.trim())}
          disabled={!noteInput.trim() || saveMutation.isPending}
          data-testid="button-save-note"
        >
          {saveMutation.isPending ? "Saving..." : "Save note"}
        </Button>
      </div>

      {/* Notes list */}
      {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}

      {!isLoading && notes.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No notes yet. Add your first note above.
        </p>
      )}

      {notes.length > 0 && (
        <div className="space-y-2">
          {notes.map((note: any) => (
            <Card key={note.id} data-testid={`note-${note.id}`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm whitespace-pre-wrap flex-1">{note.content}</p>
                  {note.authorId === currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => deleteMutation.mutate(note.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-note-${note.id}`}
                    >
                      <Trash2Icon className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {note.authorName || "You"} · {formatNoteDate(note.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activity tab ─────────────────────────────────────────────────────────────

function ActivityTab({ enrollments }: { enrollments: any[] }) {
  if (!enrollments || enrollments.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {enrollments.map((e: any) => (
        <Card key={e.id}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <ActivityIcon className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Enrolled in <span className="text-primary">{e.sequenceName}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.enrolledAt).toLocaleDateString()} · Step {e.currentStepNumber || 0} of {e.totalSteps || 0}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className={`text-xs ${statusColor(e.enrollmentStatus)}`}>
                {e.enrollmentStatus}
              </Badge>
            </div>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>📬 {e.opens ?? 0} opens</span>
              <span>🖱️ {e.clicks ?? 0} clicks</span>
              <span>💬 {e.replies ?? 0} replies</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Company tab ──────────────────────────────────────────────────────────────

function CompanyTab({ prospect }: { prospect: any }) {
  const fields = [
    { label: "Company name", value: prospect.companyName },
    { label: "Industry", value: prospect.companyIndustry },
    { label: "Size", value: prospect.companySize ? `${prospect.companySize} employees` : null },
    { label: "Domain", value: prospect.companyDomain },
    { label: "Location", value: prospect.companyLocation },
  ].filter((f) => f.value);

  if (fields.length === 0) {
    return (
      <div className="text-center py-8">
        <BuildingIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No company data available. Try enriching this prospect.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        {fields.map((f) => (
          <div key={f.label}>
            <p className="text-xs text-muted-foreground">{f.label}</p>
            <p className="text-sm font-medium">{f.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Signals tab ──────────────────────────────────────────────────────────────

function SignalsTab({ prospect }: { prospect: any }) {
  const data = prospect.enrichmentData;
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8">
        <TrendingUpIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No intent signals yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Enrich this prospect to unlock signals.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Enrichment Data</CardTitle></CardHeader>
      <CardContent>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

// ─── Sequences tab ────────────────────────────────────────────────────────────

function SequencesTab({ enrollments, isLoading }: { enrollments: any[]; isLoading: boolean }) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>;
  }

  if (!enrollments || enrollments.length === 0) {
    return (
      <div className="text-center py-8">
        <GitBranchIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Not enrolled in any sequences yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Use the "Add to Sequence" button above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {enrollments.map((e: any) => {
        const pct = e.totalSteps > 0 ? Math.round((e.currentStepNumber / e.totalSteps) * 100) : 0;
        return (
          <Card key={e.id}>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StatusIcon status={e.enrollmentStatus} />
                  <div>
                    <p className="text-sm font-medium">{e.sequenceName}</p>
                    <p className="text-xs text-muted-foreground">
                      Enrolled {new Date(e.enrolledAt).toLocaleDateString()}
                      {e.lastContactedAt && ` · Last contacted ${new Date(e.lastContactedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={`text-xs ${statusColor(e.enrollmentStatus)}`}>
                  {e.enrollmentStatus}
                </Badge>
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Step {e.currentStepNumber || 0} of {e.totalSteps || 0}</span>
                  <span>{pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>📬 {e.opens ?? 0} opens</span>
                <span>🖱️ {e.clicks ?? 0} clicks</span>
                <span>💬 {e.replies ?? 0} replies</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProspectDetail() {
  const [, params] = useRoute("/prospects/:id");
  const [, setLocation] = useLocation();
  const prospectId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedSeqId, setSelectedSeqId] = useState("");

  const { data: prospect, isLoading, error } = useQuery<any>({
    queryKey: ["/api/prospects", prospectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/prospects/${prospectId}`);
      return res.json();
    },
    enabled: !!prospectId,
  });

  const { data: progressData, isLoading: progressLoading } = useQuery<{ enrollments: any[] }>({
    queryKey: ["/api/prospects", prospectId, "sequence-progress"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/prospects/${prospectId}/sequence-progress`);
      return res.json();
    },
    enabled: !!prospectId,
  });

  const { data: sequencesData } = useQuery<{ sequences: any[] }>({
    queryKey: ["/api/sequences"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sequences");
      return res.json();
    },
    enabled: enrollOpen,
  });

  const enrichMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/enrich", { prospectIds: [prospectId] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prospects", prospectId] });
      toast({ title: "Enrichment started" });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Enrichment failed", description: err?.message });
    },
  });

  const enrollMutation = useMutation({
    mutationFn: ({ sequenceId }: { sequenceId: string }) =>
      apiRequest("POST", `/api/sequences/${sequenceId}/prospects`, { prospectIds: [prospectId] }),
    onSuccess: () => {
      const seq = sequencesData?.sequences?.find((s: any) => s.id === selectedSeqId);
      queryClient.invalidateQueries({ queryKey: ["/api/prospects", prospectId, "sequence-progress"] });
      toast({ title: "Enrolled", description: `Added to ${seq?.name || "sequence"}.` });
      setEnrollOpen(false);
      setSelectedSeqId("");
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Failed to enroll", description: err?.message || "An error occurred." });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading prospect...</p>
      </div>
    );
  }

  if (error || !prospect) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Prospect not found.</p>
        <Button variant="ghost" onClick={() => setLocation("/prospects")}>
          <ArrowLeftIcon className="w-4 h-4 mr-2" /> Back to Prospects
        </Button>
      </div>
    );
  }

  const enrollments = progressData?.enrollments ?? [];
  const displayName = prospect.fullName ||
    `${prospect.firstName || ""} ${prospect.lastName || ""}`.trim() ||
    "Unknown";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Back link */}
        <Link href="/prospects">
          <Button variant="ghost" size="sm" className="mb-4 -ml-2">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Prospects
          </Button>
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-medium text-xl flex-shrink-0">
              {getInitials(prospect.firstName, prospect.lastName)}
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="prospect-name">{displayName}</h1>
              <p className="text-muted-foreground">{prospect.jobTitle || "No title"}</p>
              {prospect.companyName && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <BuildingIcon className="w-3 h-3" /> {prospect.companyName}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              onClick={() => setEnrollOpen(true)}
              data-testid="button-add-to-sequence"
            >
              <GitBranchIcon className="w-4 h-4 mr-2" />
              Add to Sequence
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => enrichMutation.mutate()}
              disabled={enrichMutation.isPending}
              data-testid="button-enrich"
            >
              <SparklesIcon className="w-4 h-4 mr-2" />
              {enrichMutation.isPending ? "Enriching..." : "Enrich"}
            </Button>
          </div>
        </div>

        <Separator className="mb-6" />

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sequences">
              Sequences
              {enrollments.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{enrollments.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab prospect={prospect} />
          </TabsContent>

          <TabsContent value="sequences">
            <SequencesTab enrollments={enrollments} isLoading={progressLoading} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityTab enrollments={enrollments} />
          </TabsContent>

          <TabsContent value="company">
            <CompanyTab prospect={prospect} />
          </TabsContent>

          <TabsContent value="signals">
            <SignalsTab prospect={prospect} />
          </TabsContent>

          <TabsContent value="notes">
            <NotesTab prospectId={prospectId!} currentUserId={user?.id ?? ""} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Enroll in sequence dialog */}
      <Dialog open={enrollOpen} onOpenChange={(o) => { if (!o) { setEnrollOpen(false); setSelectedSeqId(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Sequence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Enroll <span className="font-medium">{displayName}</span> into a sequence.
            </p>
            <div className="space-y-2">
              <Label htmlFor="seq-select">Sequence</Label>
              <Select value={selectedSeqId} onValueChange={setSelectedSeqId}>
                <SelectTrigger id="seq-select" data-testid="select-sequence">
                  <SelectValue placeholder="Select a sequence..." />
                </SelectTrigger>
                <SelectContent>
                  {sequencesData?.sequences?.map((seq: any) => (
                    <SelectItem key={seq.id} value={seq.id}>
                      <span className="flex items-center gap-2">
                        {seq.name}
                        <Badge
                          variant="outline"
                          className={`text-xs ml-1 ${seq.status === "active" ? "text-green-600 border-green-300" : "text-muted-foreground"}`}
                        >
                          {seq.status}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEnrollOpen(false); setSelectedSeqId(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => enrollMutation.mutate({ sequenceId: selectedSeqId })}
              disabled={!selectedSeqId || enrollMutation.isPending}
              data-testid="button-confirm-enroll"
            >
              {enrollMutation.isPending ? "Enrolling..." : "Enroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
