import { useState, useEffect } from "react";
import { Users, MessageSquare, Zap, BarChart3, Settings, Plus, RefreshCw, Sparkles, ArrowLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, useLocation } from "wouter";
import type { Prospect } from "@shared/schema";

interface Sequence {
  id: string;
  name: string;
  description: string;
  status: string;
  totalProspects: number;
  activeProspects: number;
  createdAt: Date;
}

export default function SequencesPage() {
  const [_, setLocation] = useLocation();
  const [selectedSequence, setSelectedSequence] = useState<string | null>(null);

  const { data: sequences, isLoading } = useQuery<Sequence[]>({
    queryKey: ["/api/sequences"],
  });

  if (selectedSequence && sequences) {
    const sequence = sequences.find(s => s.id === selectedSequence);
    if (sequence) {
      return <SequenceBuilder sequence={sequence} onBack={() => setSelectedSequence(null)} />;
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Sequences</h1>
              <p className="text-muted-foreground">Create and manage email sequences</p>
            </div>
          </div>
          <CreateSequenceButton />
        </div>

        {isLoading ? (
          <div className="text-center py-16">Loading sequences...</div>
        ) : !sequences || sequences.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sequences yet</h3>
              <p className="text-muted-foreground mb-6">Create your first email sequence to get started</p>
              <CreateSequenceButton />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sequences.map((sequence) => (
              <Card 
                key={sequence.id} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => setSelectedSequence(sequence.id)}
                data-testid={`card-sequence-${sequence.id}`}
              >
                <CardHeader>
                  <CardTitle>{sequence.name}</CardTitle>
                  <CardDescription>{sequence.description || "No description"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant={sequence.status === "active" ? "default" : "secondary"}>
                        {sequence.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Prospects:</span>
                      <span className="font-medium">{sequence.totalProspects || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateSequenceButton() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      return await apiRequest("/api/sequences", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence created successfully" });
      setShowForm(false);
      setName("");
      setDescription("");
    },
    onError: () => {
      toast({ title: "Failed to create sequence", variant: "destructive" });
    },
  });

  if (showForm) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create New Sequence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Email Sequence"
              data-testid="input-sequence-name"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description of this sequence..."
              data-testid="input-sequence-description"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (name.trim()) {
                  createMutation.mutate({ name, description });
                }
              }}
              disabled={!name.trim() || createMutation.isPending}
              data-testid="button-create-sequence"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
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
    <Button onClick={() => setShowForm(true)} data-testid="button-new-sequence">
      <Plus className="w-4 h-4 mr-2" />
      New Sequence
    </Button>
  );
}

function SequenceBuilder({ sequence, onBack }: { sequence: Sequence; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState("prospects");

  const tabs = [
    { id: "prospects", label: "Prospects", icon: Users },
    { id: "replies", label: "Replies", icon: MessageSquare },
    { id: "tracking", label: "Tracking", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-list">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{sequence.name}</h1>
            <p className="text-muted-foreground">{sequence.description}</p>
          </div>
        </div>

        <Card className="mb-6">
          <div className="border-b flex overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardContent className="p-6">
            {activeTab === "prospects" && <ProspectsTab sequenceId={sequence.id} />}
            {activeTab === "replies" && <RepliesTab sequenceId={sequence.id} />}
            {activeTab === "tracking" && <TrackingTab sequenceId={sequence.id} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProspectsTab({ sequenceId }: { sequenceId: string }) {
  const { toast } = useToast();

  const { data } = useQuery({
    queryKey: ["/api/sequences", sequenceId, "prospects"],
  });

  const prospects = data?.prospects || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Prospects</h2>
          <p className="text-muted-foreground">{prospects.length} enrolled</p>
        </div>
      </div>

      {prospects.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No prospects enrolled</h3>
          <p className="text-muted-foreground">Add prospects from your main prospects list</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold">Name</th>
                <th className="text-left py-3 px-4 font-semibold">Company</th>
                <th className="text-left py-3 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((item: any) => (
                <tr key={item.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-4">{item.prospect?.fullName || `${item.prospect?.firstName || ""} ${item.prospect?.lastName || ""}`.trim()}</td>
                  <td className="py-3 px-4">{item.prospect?.companyName}</td>
                  <td className="py-3 px-4">
                    <Badge variant="secondary">{item.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RepliesTab({ sequenceId }: { sequenceId: string }) {
  const { data, refetch } = useQuery({
    queryKey: ["/api/sequences", sequenceId, "replies"],
  });

  const replies = data?.replies || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Email Replies</h2>
          <p className="text-muted-foreground">{data?.total || 0} replies</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" data-testid="button-refresh-replies">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {replies.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No replies yet</h3>
          <p className="text-muted-foreground">Replies will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {replies.map((reply: any) => (
            <Card key={reply.id}>
              <CardHeader>
                <CardTitle className="text-base">{reply.prospect?.fullName}</CardTitle>
                <CardDescription>{new Date(reply.receivedAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{reply.replyContent}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackingTab({ sequenceId }: { sequenceId: string }) {
  const { data } = useQuery({
    queryKey: ["/api/sequences", sequenceId, "tracking"],
  });

  const stats = data || { sent: 0, delivered: 0, opened: 0, replied: 0 };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Email Tracking</h2>
      <div className="grid grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <CardDescription>Sent</CardDescription>
            <CardTitle className="text-3xl">{stats.sent}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Delivered</CardDescription>
            <CardTitle className="text-3xl">{stats.delivered}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Opened</CardDescription>
            <CardTitle className="text-3xl">{stats.opened}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Replied</CardDescription>
            <CardTitle className="text-3xl">{stats.replied}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
