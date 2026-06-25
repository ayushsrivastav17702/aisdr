import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Target, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IntentListItem {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  status: string;
  currentVersion: {
    versionNumber: number;
    publishedAt: string | null;
    status: "draft" | "published";
  } | null;
}

interface IntentListResponse {
  intents: IntentListItem[];
  total: number;
  limit: number;
  offset: number;
}

const STATUS_OPTIONS = ["draft", "testing", "approved", "production", "deprecated", "archived"];
const SCOPE_OPTIONS = ["account", "contact"];

function statusBadgeVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "production": return "default";
    case "archived": return "destructive";
    case "draft": return "outline";
    default: return "secondary";
  }
}

// The /v1/intents/* routes are gated server-side behind FEATURE_INTENT_ENGINE.
// When disabled, every request returns 503 INTENT_ENGINE_DISABLED — detect
// that here rather than adding a new backend endpoint just to expose the flag.
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

export default function IntentRegistry() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [scope, setScope] = useState<string>("all");

  // Manual debounce — matches the pattern used in prospects-table.tsx
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams: Record<string, string> = {};
  if (status !== "all") queryParams.status = status;
  if (scope !== "all") queryParams.scope = scope;
  if (debouncedSearch) queryParams.search = debouncedSearch;

  // Phase 4 endpoints respond with { data: T } — unwrap via select() rather
  // than touching the shared default queryFn (other pages rely on its
  // flat-shape behavior).
  const { data, isLoading, error } = useQuery<{ data: IntentListResponse }, Error, IntentListResponse>({
    queryKey: ["/v1/intents", queryParams],
    select: (res) => res.data,
  });

  if (isIntentEngineDisabledError(error)) {
    return (
      <Layout>
        <ComingSoon />
      </Layout>
    );
  }

  if (error) {
    toast({
      title: "Failed to load intents",
      description: error instanceof Error ? error.message : "Unknown error",
      variant: "destructive",
    });
  }

  const intents = data?.intents ?? [];

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Intent Registry</h1>
            <p className="text-muted-foreground mt-1">
              Define and manage intent rules used to qualify and score prospects.
            </p>
          </div>
          <Button onClick={() => setLocation("/intents/new")} data-testid="button-create-intent">
            <Plus className="w-4 h-4 mr-2" />
            Create Intent
          </Button>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-intents"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-[160px]" data-testid="select-filter-scope">
              <SelectValue placeholder="Scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              {SCOPE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : intents.length === 0 ? (
              <div className="text-center py-16">
                <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No intents found</h3>
                <p className="text-muted-foreground mb-4">
                  {search || status !== "all" || scope !== "all"
                    ? "Try adjusting your search or filters"
                    : "Get started by creating your first intent"}
                </p>
                {!search && status === "all" && scope === "all" && (
                  <Button onClick={() => setLocation("/intents/new")} data-testid="button-create-first-intent">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Intent
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Updated At</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intents.map((intent) => (
                    <TableRow
                      key={intent.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setLocation(`/intents/${intent.id}`)}
                      data-testid={`row-intent-${intent.id}`}
                    >
                      <TableCell className="font-medium">
                        {intent.name}
                        {intent.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{intent.description}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{intent.scope}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(intent.status)}>{intent.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {intent.currentVersion ? (
                          <span className="text-sm">
                            v{intent.currentVersion.versionNumber}{" "}
                            <Badge variant={intent.currentVersion.status === "published" ? "default" : "outline"} className="ml-1 text-xs">
                              {intent.currentVersion.status}
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {intent.currentVersion?.publishedAt
                          ? new Date(intent.currentVersion.publishedAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
