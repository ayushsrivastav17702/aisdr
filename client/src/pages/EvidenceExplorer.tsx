import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Search, Database, ChevronDown, ChevronRight } from "lucide-react";

interface EvidenceItem {
  id: string;
  signalType: string;
  sourceType: string;
  sourceTimestamp: string;
  payload: Record<string, unknown>;
  trustScore: number;
  createdAt: string;
}

function isIntentEngineDisabledError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("503:");
}

function ComingSoon() {
  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardContent className="py-16 text-center">
          <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Evidence Explorer — Coming Soon</h2>
          <p className="text-muted-foreground">
            The Intent Definition Engine is not yet enabled for this environment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EvidenceExplorer() {
  const { toast } = useToast();
  const [entityIdInput, setEntityIdInput] = useState("");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [signalType, setSignalType] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [since, setSince] = useState("");
  const [limit, setLimit] = useState("50");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const queryParams: Record<string, string> = { limit };
  if (signalType) queryParams.signalTypes = signalType;
  if (sourceType) queryParams.sourceTypes = sourceType;
  if (since) queryParams.since = new Date(since).toISOString();

  const { data, isLoading, error } = useQuery<
    { data: { evidence: EvidenceItem[] } },
    Error,
    { evidence: EvidenceItem[] }
  >({
    queryKey: [`/v1/evidence/entity/${entityId}`, queryParams],
    select: (res) => res.data,
    enabled: !!entityId,
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
      title: "Failed to load evidence",
      description: error.message,
      variant: "destructive",
    });
  }

  const evidence = data?.evidence ?? [];

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Evidence Explorer</h1>
          <p className="text-muted-foreground mt-1">
            Inspect raw evidence signals collected for an account or contact.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lookup</CardTitle>
            <CardDescription>Enter a prospect or account ID to view its evidence trail.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[260px] space-y-2">
                <Label htmlFor="entity-id">Prospect / Account ID</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="entity-id"
                    placeholder="e.g. 969a4798-d257-41da-bba2-7e12b0fa020e"
                    value={entityIdInput}
                    onChange={(e) => setEntityIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && setEntityId(entityIdInput.trim())}
                    className="pl-10"
                    data-testid="input-entity-id"
                  />
                </div>
              </div>
              <div className="space-y-2 w-[180px]">
                <Label htmlFor="signal-type">Signal type</Label>
                <Input
                  id="signal-type"
                  placeholder="e.g. email_open"
                  value={signalType}
                  onChange={(e) => setSignalType(e.target.value)}
                  data-testid="input-signal-type"
                />
              </div>
              <div className="space-y-2 w-[180px]">
                <Label htmlFor="source-type">Source type</Label>
                <Input
                  id="source-type"
                  placeholder="e.g. email_system"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                  data-testid="input-source-type"
                />
              </div>
              <div className="space-y-2 w-[160px]">
                <Label htmlFor="since-date">Since</Label>
                <Input
                  id="since-date"
                  type="date"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  data-testid="input-since-date"
                />
              </div>
              <div className="space-y-2 w-[100px]">
                <Label htmlFor="limit">Limit</Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  data-testid="input-limit"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => setEntityId(entityIdInput.trim())} disabled={!entityIdInput.trim()} data-testid="button-search-evidence">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {entityId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Evidence for <span className="font-mono">{entityId}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : evidence.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="w-10 h-10 mx-auto mb-3" />
                  No evidence found for this entity
                </div>
              ) : (
                <div className="space-y-2">
                  {evidence.map((item) => (
                    <Collapsible
                      key={item.id}
                      open={expandedRow === item.id}
                      onOpenChange={(open) => setExpandedRow(open ? item.id : null)}
                    >
                      <CollapsibleTrigger asChild>
                        <div
                          className="flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted/50"
                          data-testid={`row-evidence-${item.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary">{item.signalType}</Badge>
                            <Badge variant="outline">{item.sourceType}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(item.sourceTimestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge>{item.trustScore} trust</Badge>
                            {expandedRow === item.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="p-3 border-x border-b rounded-b-md bg-muted/20">
                        <pre className="text-xs font-mono overflow-x-auto" data-testid={`text-evidence-payload-${item.id}`}>
                          {JSON.stringify(item.payload, null, 2)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
