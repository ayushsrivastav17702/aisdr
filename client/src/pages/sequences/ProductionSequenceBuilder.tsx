import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { X, Mail, Users, MessageSquare, Zap, BarChart3, Settings } from "lucide-react";
import { SequenceTab } from "./tabs/SequenceTab";
import { ProspectsTab } from "./tabs/ProspectsTab";
import { RepliesTab } from "./tabs/RepliesTab";
import { AIFollowupTab } from "./tabs/AIFollowupTab";
import { TrackingTab } from "./tabs/TrackingTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { ActivateSequenceButton } from "./ActivateSequenceButton";

export function ProductionSequenceBuilder({ sequenceId }: { sequenceId: string }) {
  const [activeTab, setActiveTab] = useState('sequence');
  const [sequenceName, setSequenceName] = useState('');
  const [sequenceDescription, setSequenceDescription] = useState('');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sequence, isLoading: sequenceLoading } = useQuery({
    queryKey: ['/api/sequences', sequenceId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}`, undefined);
      return await res.json();
    },
  });

  const { data: prospectsData, isLoading: prospectsLoading } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'prospects'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/prospects`, undefined);
      return await res.json();
    },
    enabled: activeTab === 'prospects' || activeTab === 'ai-followup', // Only load when needed
  });

  const { data: repliesData } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'replies'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/replies`, undefined);
      return await res.json();
    },
    refetchInterval: activeTab === 'replies' ? 30000 : false, // Only poll when on Replies tab
    enabled: activeTab === 'replies', // Only load when Replies tab is active
  });

  const updateSequenceMutation = useMutation({
    mutationFn: async (data: { name?: string; description?: string }) => {
      return await apiRequest("PATCH", `/api/sequences/${sequenceId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      toast({ title: "Sequence updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update sequence", variant: "destructive" });
    }
  });

  // Initialize name and description from loaded sequence
  useEffect(() => {
    if (sequence) {
      setSequenceName(sequence.name || '');
      setSequenceDescription(sequence.description || '');
    }
  }, [sequence?.id]);

  if (sequenceLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="h-12 bg-gray-200 rounded w-full mb-4"></div>
        </div>
      </div>
    );
  }

  const handleSaveSequence = () => {
    updateSequenceMutation.mutate({
      name: sequenceName,
      description: sequenceDescription
    });
  };

  const tabs = [
    { id: 'sequence', label: 'Sequence', icon: Mail },
    { id: 'prospects', label: 'Prospects', icon: Users },
    { id: 'replies', label: 'Replies', icon: MessageSquare },
    { id: 'ai-followup', label: 'AI Follow-up', icon: Zap },
    { id: 'tracking', label: 'Email Tracking', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const handleClose = () => {
    setLocation('/sequences');
  };

  return (
    <div className="min-h-screen bg-background">
      <Dialog open={true} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
            <DialogTitle className="text-xl font-semibold">Sequence Builder</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4"
              onClick={handleClose}
              data-testid="button-close-builder"
            >
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <div className="border-b px-6 flex-shrink-0">
              <TabsList className="w-full justify-start h-auto p-0 bg-transparent">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex items-center gap-2 px-4 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                      data-testid={`tab-${tab.id}`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <TabsContent value="sequence" className="m-0 p-6">
                <SequenceTab
                  sequenceId={sequenceId}
                  steps={sequence?.steps || []}
                  name={sequenceName}
                  setName={setSequenceName}
                  description={sequenceDescription}
                  setDescription={setSequenceDescription}
                />
              </TabsContent>

              <TabsContent value="prospects" className="m-0 p-6">
                <ProspectsTab
                  sequenceId={sequenceId}
                  prospects={prospectsData?.prospects || []}
                  isLoading={prospectsLoading}
                />
              </TabsContent>

              <TabsContent value="replies" className="m-0 p-6">
                <RepliesTab sequenceId={sequenceId} replies={repliesData?.replies || []} />
              </TabsContent>

              <TabsContent value="ai-followup" className="m-0 p-6">
                <AIFollowupTab sequenceId={sequenceId} />
              </TabsContent>

              <TabsContent value="tracking" className="m-0 p-6">
                <TrackingTab sequenceId={sequenceId} />
              </TabsContent>

              <TabsContent value="settings" className="m-0 p-6">
                <SettingsTab sequenceId={sequenceId} sequence={sequence} />
              </TabsContent>
            </div>

            <div className="border-t px-6 py-4 flex items-center justify-between bg-muted/30 flex-shrink-0">
              <span className="text-sm text-muted-foreground">
                {sequence?.steps?.length || 0} steps in sequence • {prospectsData?.prospects?.length || 0} prospects enrolled
              </span>
              <div className="flex gap-2">
                <Link href="/sequences">
                  <Button variant="outline" data-testid="button-cancel">
                    Cancel
                  </Button>
                </Link>
                <Button
                  onClick={handleSaveSequence}
                  disabled={updateSequenceMutation.isPending}
                  data-testid="button-save-sequence"
                >
                  {updateSequenceMutation.isPending ? "Saving..." : "Save Sequence"}
                </Button>
                <ActivateSequenceButton
                  sequenceId={sequenceId}
                  currentStatus={sequence?.status}
                  hasSteps={(sequence?.steps?.length || 0) > 0}
                  hasProspects={(prospectsData?.prospects?.length || 0) > 0}
                />
              </div>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
