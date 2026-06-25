import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Target,
  Save,
  Rocket,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  History,
  PlayCircle,
  GitCompare,
  RotateCcw,
  Loader2,
} from "lucide-react";

// ─── Types (mirror server/routes/intents.routes.ts response shapes) ─────────

interface IntentVersionSummary {
  id: string;
  versionNumber: number;
  status: "draft" | "published";
  changelog: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface IntentDetail {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  status: string;
  currentVersion: {
    id: string;
    versionNumber: number;
    dslText: string;
    compiledAst: unknown;
    status: "draft" | "published";
    publishedAt: string | null;
    createdAt: string;
  } | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ValidateDslResponse {
  valid: boolean;
  errors: { field: string; message: string }[];
  warnings: string[];
  complexity: number | null;
}

interface RuleTrace {
  ruleId: string;
  ruleLabel: string | null;
  passed: boolean;
  signal: string;
  operator: string;
  evaluatedValue: unknown;
  expectedValue: unknown;
  evidenceIds: string[];
  executionMs: number;
}

interface SimulateResponse {
  intentVersionId: string;
  isReplay: boolean;
  summary: { total: number; matched: number; unmatched: number; errors: number; matchRate: string };
  matched: { prospectId: string; score: number; trace: RuleTrace[] }[];
  unmatched: { prospectId: string }[];
  errors: { prospectId: string; error: string }[];
}

const DEFAULT_DSL = `{
  "version": "1.0",
  "name": "New Intent",
  "match": {
    "type": "condition",
    "signal": "email_open",
    "operator": "exists"
  }
}`;

function isIntentEngineDisabledError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("503:");
}

function ComingSoon() {
  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardContent className="py-16 text-center">
          <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Intent Studio — Coming Soon</h2>
          <p className="text-muted-foreground">
            The Intent Definition Engine is not yet enabled for this environment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function IntentStudio() {
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isNew = !params.id || params.id === "new";
  const intentId = isNew ? undefined : params.id;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("account");
  const [dslText, setDslText] = useState(DEFAULT_DSL);
  const [tab, setTab] = useState("editor");

  // Phase 4 endpoints respond with { data: T } — unwrap via select().
  const { data: intent, isLoading, error } = useQuery<{ data: IntentDetail }, Error, IntentDetail>({
    queryKey: [`/v1/intents/${intentId}`],
    select: (res) => res.data,
    enabled: !!intentId,
  });

  // Populate local form state once the intent loads
  useEffect(() => {
    if (intent) {
      setName(intent.name);
      setDescription(intent.description ?? "");
      setScope(intent.scope);
      if (intent.currentVersion) setDslText(intent.currentVersion.dslText);
    }
  }, [intent]);

  // ── Live DSL validation (debounced) ───────────────────────────────────────
  const [debouncedDsl, setDebouncedDsl] = useState(dslText);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDsl(dslText), 500);
    return () => clearTimeout(timer);
  }, [dslText]);

  const validateMutation = useMutation({
    mutationFn: async (dsl: string) => {
      const res = await apiRequest("POST", "/v1/intents/validate-dsl", { dsl });
      return res.json() as Promise<ValidateDslResponse>;
    },
  });

  useEffect(() => {
    if (!debouncedDsl.trim()) return;
    validateMutation.mutate(debouncedDsl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDsl]);

  const validation = validateMutation.data;

  // ── Save (create or update) ───────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const res = await apiRequest("POST", "/v1/intents", {
          name,
          description: description || undefined,
          scope,
          dsl_text: dslText,
        });
        return res.json();
      } else {
        const res = await apiRequest("PUT", `/v1/intents/${intentId}`, {
          name,
          description: description || undefined,
          scope,
          dsl_text: dslText,
        });
        return res.json();
      }
    },
    onSuccess: (result: { data: { intentId: string; versionId: string; status: string } }) => {
      toast({ title: "Draft saved" });
      queryClient.invalidateQueries({ queryKey: ["/v1/intents"] });
      if (isNew) {
        setLocation(`/intents/${result.data.intentId}`);
      } else {
        queryClient.invalidateQueries({ queryKey: [`/v1/intents/${intentId}`] });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save intent", description: err.message, variant: "destructive" });
    },
  });

  // ── Publish ────────────────────────────────────────────────────────────────
  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/v1/intents/${intentId}/publish`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Intent published" });
      queryClient.invalidateQueries({ queryKey: [`/v1/intents/${intentId}`] });
      queryClient.invalidateQueries({ queryKey: [`/v1/intents/${intentId}/versions`] });
      queryClient.invalidateQueries({ queryKey: ["/v1/intents"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to publish", description: err.message, variant: "destructive" });
    },
  });

  if (isIntentEngineDisabledError(error)) {
    return (
      <Layout>
        <ComingSoon />
      </Layout>
    );
  }

  if (!isNew && isLoading) {
    return (
      <Layout>
        <div className="container mx-auto py-6 space-y-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Intent name"
              className="text-2xl font-bold h-auto border-0 px-0 focus-visible:ring-0"
              data-testid="input-intent-name"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="text-sm text-muted-foreground border-0 px-0 focus-visible:ring-0"
              data-testid="input-intent-description"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-[140px]" data-testid="select-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">account</SelectItem>
                <SelectItem value="contact">contact</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !name.trim()}
              data-testid="button-save-intent"
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? "Saving..." : "Save Draft"}
            </Button>
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={isNew || publishMutation.isPending}
              data-testid="button-publish-intent"
            >
              <Rocket className="w-4 h-4 mr-2" />
              {publishMutation.isPending ? "Publishing..." : "Publish"}
            </Button>
          </div>
        </div>

        {intent && (
          <div className="flex items-center gap-2">
            <Badge variant="outline">{intent.status}</Badge>
            {intent.currentVersion && (
              <Badge variant={intent.currentVersion.status === "published" ? "default" : "secondary"}>
                v{intent.currentVersion.versionNumber} · {intent.currentVersion.status}
              </Badge>
            )}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="editor" data-testid="tab-editor">Editor</TabsTrigger>
            <TabsTrigger value="simulation" disabled={isNew} data-testid="tab-simulation">Simulation</TabsTrigger>
            <TabsTrigger value="history" disabled={isNew} data-testid="tab-history">Version History</TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="space-y-3 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">DSL Definition</CardTitle>
                <CardDescription>
                  Raw JSON DSL. Validated automatically as you type.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden" data-testid="editor-dsl">
                  <Editor
                    height="400px"
                    defaultLanguage="plaintext"
                    value={dslText}
                    onChange={(value) => setDslText(value || "")}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      tabSize: 2,
                      lineNumbers: "on",
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>

                <div className="mt-3 space-y-2">
                  {validateMutation.isPending && (
                    <p className="text-xs text-muted-foreground">Validating...</p>
                  )}
                  {validation && validation.valid && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Valid DSL{validation.complexity !== null && ` · complexity ${validation.complexity}`}
                    </div>
                  )}
                  {validation && !validation.valid && validation.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-destructive" data-testid={`text-dsl-error-${i}`}>
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span><strong>{e.field}:</strong> {e.message}</span>
                    </div>
                  ))}
                  {validation?.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="simulation" className="mt-4">
            {intentId && intent?.currentVersion && (
              <SimulationPanel intentId={intentId} defaultVersionId={intent.currentVersion.id} />
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {intentId && <VersionHistoryPanel intentId={intentId} activeVersionId={intent?.currentVersion?.id ?? null} />}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// ─── Simulation tab ───────────────────────────────────────────────────────────
// NOTE: POST /v1/intents/:id/simulate requires an explicit prospectIds list +
// optional `since` cutoff — there's no backend endpoint to resolve "all
// prospects active in a date range" into an id list, so this is a prospect-ID
// input plus a single "since" date, not a from/to range picker.

interface SimulationProspect {
  id: string;
  email: string | null;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
}

function SimulationPanel({ intentId, defaultVersionId }: { intentId: string; defaultVersionId: string }) {
  const { toast } = useToast();
  const [since, setSince] = useState("");
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  // Pull a recent batch of this tenant's prospects to populate the picker —
  // GET /v1/prospects (Phase 5), tenant-scoped server-side via req.user.id.
  const { data: prospectsData, isLoading: prospectsLoading } = useQuery<
    { data: { prospects: SimulationProspect[] } },
    Error,
    { prospects: SimulationProspect[] }
  >({
    queryKey: ["/v1/prospects", { since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), limit: 100 }],
    select: (res) => res.data,
  });

  const prospects = prospectsData?.prospects ?? [];

  const toggleProspect = (id: string) => {
    setSelectedProspectIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const simulateMutation = useMutation({
    mutationFn: async () => {
      if (selectedProspectIds.length === 0) {
        throw new Error("Select at least one prospect to simulate against");
      }

      const body: Record<string, unknown> = { intentVersionId: defaultVersionId, prospectIds: selectedProspectIds };
      if (since) body.since = new Date(since).toISOString();

      const res = await apiRequest("POST", `/v1/intents/${intentId}/simulate`, body);
      return res.json() as Promise<SimulateResponse>;
    },
    onError: (err: Error) => {
      toast({ title: "Simulation failed", description: err.message, variant: "destructive" });
    },
  });

  const result = simulateMutation.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run Simulation</CardTitle>
          <CardDescription>Replay this intent against historical evidence without writing matches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Prospects</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  disabled={prospectsLoading}
                  data-testid="button-select-prospects"
                >
                  {prospectsLoading ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading prospects...
                    </span>
                  ) : selectedProspectIds.length > 0 ? (
                    <Badge variant="secondary" data-testid="badge-selected-count">
                      {selectedProspectIds.length} prospect{selectedProspectIds.length === 1 ? "" : "s"} selected
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Select prospects...</span>
                  )}
                  <ChevronDown className="w-4 h-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                {!prospectsLoading && prospects.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center" data-testid="text-no-prospects">
                    No recent prospects found. Try adjusting the date range.
                  </div>
                ) : (
                  <ScrollArea className="h-72">
                    <div className="p-2">
                      {prospects.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                          data-testid={`option-prospect-${p.id}`}
                        >
                          <Checkbox
                            checked={selectedProspectIds.includes(p.id)}
                            onCheckedChange={() => toggleProspect(p.id)}
                          />
                          <span className="truncate">
                            {p.email ?? "(no email)"} ({p.company || "No company"})
                          </span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="sim-since">Since (optional)</Label>
            <Input
              id="sim-since"
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              data-testid="input-simulate-since"
            />
          </div>
          <Button
            onClick={() => simulateMutation.mutate()}
            disabled={simulateMutation.isPending}
            data-testid="button-run-simulation"
          >
            <PlayCircle className="w-4 h-4 mr-2" />
            {simulateMutation.isPending ? "Running..." : "Run"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <SummaryStat label="Total" value={result.summary.total} />
              <SummaryStat label="Matched" value={result.summary.matched} />
              <SummaryStat label="Unmatched" value={result.summary.unmatched} />
              <SummaryStat label="Match Rate" value={result.summary.matchRate} />
            </div>

            {result.matched.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Sample matches</h4>
                <div className="space-y-2">
                  {result.matched.map((m) => (
                    <Collapsible
                      key={m.prospectId}
                      open={expandedTrace === m.prospectId}
                      onOpenChange={(open) => setExpandedTrace(open ? m.prospectId : null)}
                    >
                      <CollapsibleTrigger asChild>
                        <div
                          className="flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted/50"
                          data-testid={`row-trace-${m.prospectId}`}
                        >
                          <span className="font-mono text-sm">{m.prospectId}</span>
                          <div className="flex items-center gap-2">
                            <Badge>{m.score} pts</Badge>
                            {expandedTrace === m.prospectId ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="p-3 border-x border-b rounded-b-md bg-muted/20 space-y-2">
                        {m.trace.map((t, i) => (
                          <div key={i} className="text-xs flex items-start gap-2">
                            {t.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                            )}
                            <div>
                              <span className="font-mono">{t.ruleId}</span>: {t.signal} {t.operator}{" "}
                              <span className="text-muted-foreground">
                                (evaluated: {JSON.stringify(t.evaluatedValue)}, expected: {JSON.stringify(t.expectedValue)})
                              </span>
                              {t.evidenceIds.length > 0 && (
                                <div className="text-muted-foreground">evidence: {t.evidenceIds.join(", ")}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 text-destructive">Errors</h4>
                {result.errors.map((e) => (
                  <p key={e.prospectId} className="text-xs text-destructive font-mono">{e.prospectId}: {e.error}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center p-3 rounded-md border">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ─── Version History tab ──────────────────────────────────────────────────────

function VersionHistoryPanel({ intentId, activeVersionId }: { intentId: string; activeVersionId: string | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [diffTarget, setDiffTarget] = useState<{ versionId: string } | null>(null);

  const { data, isLoading } = useQuery<{ data: { versions: IntentVersionSummary[] } }, Error, { versions: IntentVersionSummary[] }>({
    queryKey: [`/v1/intents/${intentId}/versions`],
    select: (res) => res.data,
  });

  const rollbackMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await apiRequest("POST", `/v1/intents/${intentId}/versions/${versionId}/rollback`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rolled back to a new draft version" });
      queryClient.invalidateQueries({ queryKey: [`/v1/intents/${intentId}/versions`] });
      queryClient.invalidateQueries({ queryKey: [`/v1/intents/${intentId}`] });
    },
    onError: (err: Error) => {
      toast({ title: "Rollback failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const versions = data?.versions ?? [];

  return (
    <div className="space-y-3">
      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-3" />
            No versions yet
          </CardContent>
        </Card>
      ) : (
        versions.map((v) => (
          <Card key={v.id} data-testid={`row-version-${v.versionNumber}`}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Badge variant={v.status === "published" ? "default" : "outline"}>v{v.versionNumber}</Badge>
                <div>
                  <p className="text-sm font-medium capitalize">{v.status}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(v.createdAt).toLocaleString()}
                    {v.publishedAt && ` · Published ${new Date(v.publishedAt).toLocaleString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setDiffTarget({ versionId: v.id })} data-testid={`button-diff-${v.versionNumber}`}>
                  <GitCompare className="w-3.5 h-3.5 mr-1.5" />
                  Diff
                </Button>
                {v.status === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rollbackMutation.mutate(v.id)}
                    disabled={rollbackMutation.isPending}
                    data-testid={`button-rollback-${v.versionNumber}`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Rollback
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {diffTarget && (
        <DiffDialog
          intentId={intentId}
          versionId={diffTarget.versionId}
          versions={versions}
          defaultCompareTo={activeVersionId}
          onClose={() => setDiffTarget(null)}
        />
      )}
    </div>
  );
}

function DiffDialog({
  intentId,
  versionId,
  versions,
  defaultCompareTo,
  onClose,
}: {
  intentId: string;
  versionId: string;
  versions: IntentVersionSummary[];
  defaultCompareTo: string | null;
  onClose: () => void;
}) {
  const [compareTo, setCompareTo] = useState<string>(defaultCompareTo ?? "");

  type DiffResult = { versionA: { id: string; dslText: string }; versionB: { id: string; dslText: string }; diff: string };
  const { data, isLoading, error } = useQuery<{ data: DiffResult }, Error, DiffResult>({
    queryKey: [`/v1/intents/${intentId}/versions/${versionId}/diff`, compareTo ? { compareTo } : {}],
    select: (res) => res.data,
    enabled: !!compareTo,
  });

  const otherVersions = useMemo(() => versions.filter((v) => v.id !== versionId), [versions, versionId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare versions</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Compare against</Label>
            <Select value={compareTo} onValueChange={setCompareTo}>
              <SelectTrigger data-testid="select-diff-compare-to">
                <SelectValue placeholder="Select a version" />
              </SelectTrigger>
              <SelectContent>
                {otherVersions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>v{v.versionNumber} ({v.status})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading && <Skeleton className="h-64 w-full" />}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
          {data && (
            <pre className="text-xs font-mono bg-muted p-3 rounded-md overflow-x-auto whitespace-pre" data-testid="text-diff-output">
              {data.diff.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("+") ? "text-green-600 dark:text-green-400" :
                    line.startsWith("-") ? "text-red-600 dark:text-red-400" :
                    "text-muted-foreground"
                  }
                >
                  {line}
                </div>
              ))}
            </pre>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
