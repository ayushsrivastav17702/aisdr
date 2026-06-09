import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, RefreshCw, Eye, Send, Search } from "lucide-react";

export function AIFollowupTab({ sequenceId }: { sequenceId: string }) {
  const [schedulerActive, setSchedulerActive] = useState(false);
  const [daysBetween, setDaysBetween] = useState("3");
  const [maxFollowups, setMaxFollowups] = useState("3");
  const [followupType, setFollowupType] = useState("gentle_reminder");
  const [triggerCondition, setTriggerCondition] = useState("no_response");
  const [selectedContent, setSelectedContent] = useState<string[]>([]);
  const [selectedProspects, setSelectedProspects] = useState<string[]>([]);
  const [prospectSearch, setProspectSearch] = useState("");
  const [contentSearch, setContentSearch] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const { toast } = useToast();

  const { data: contentLibrary } = useQuery({
    queryKey: ["/api/content-library"],
  });

  const { data: prospectsData } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'prospects'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/prospects`, undefined);
      return await res.json();
    },
  });

  const contentItems = (contentLibrary as any)?.items || [];
  const prospects = prospectsData?.prospects || [];

  const filteredContent = contentItems.filter((item: any) => {
    const searchLower = contentSearch.toLowerCase();
    return (item.title || '').toLowerCase().includes(searchLower) ||
           (item.description || '').toLowerCase().includes(searchLower);
  });

  const filteredProspects = prospects.filter((p: any) => {
    const searchLower = prospectSearch.toLowerCase();
    const prospectData = p.prospect || p;
    const fullName = prospectData.fullName || `${prospectData.firstName || ''} ${prospectData.lastName || ''}`.trim();
    const matchesSearch =
      fullName.toLowerCase().includes(searchLower) ||
      (prospectData.companyName || '').toLowerCase().includes(searchLower) ||
      (prospectData.primaryEmail || '').toLowerCase().includes(searchLower);
    return matchesSearch;
  });

  const handleSelectAll = () => {
    const filteredIds = filteredProspects.map((p: any) => p.id);
    const allFilteredSelected = filteredProspects.length > 0 &&
      filteredProspects.every((p: any) => selectedProspects.includes(p.id));

    if (allFilteredSelected) {
      // Remove only the filtered prospects from selection, keep others
      setSelectedProspects(selectedProspects.filter(id => !filteredIds.includes(id)));
    } else {
      // Add filtered prospects to existing selection (union)
      const newSelection = new Set([...selectedProspects, ...filteredIds]);
      setSelectedProspects(Array.from(newSelection));
    }
  };

  const previewMutation = useMutation({
    mutationFn: async (prospectId: string) => {
      const res = await apiRequest("POST", "/api/sequences/followup-preview", {
        prospectId,
        emailHistory: "",
        followUpType: followupType,
        followUpNumber: 1
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setShowPreview(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Preview failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handlePreviewEmail = () => {
    if (selectedProspects.length === 0) {
      toast({
        title: "No prospects selected",
        description: "Please select at least one prospect to preview",
        variant: "destructive"
      });
      return;
    }

    // Get the first selected prospect's actual prospect ID
    const firstSelectedSequenceProspect = prospects.find((p: any) => p.id === selectedProspects[0]);
    if (firstSelectedSequenceProspect) {
      const prospectId = firstSelectedSequenceProspect.prospectId;
      previewMutation.mutate(prospectId);
    }
  };

  const handleScheduleFollowups = () => {
    toast({
      title: `Follow-ups scheduled for ${selectedProspects.length} prospects`,
      description: "AI will generate personalized follow-ups based on your settings"
    });
    setSelectedProspects([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">AI Follow-up Configuration</h2>
          <p className="text-sm text-muted-foreground mt-1">AI Follow-up Scheduler</p>
          <p className="text-sm text-muted-foreground">Automatically sends follow-ups based on conditions</p>
        </div>
        <Button
          variant={schedulerActive ? "default" : "outline"}
          onClick={() => setSchedulerActive(!schedulerActive)}
          data-testid="button-start-scheduler"
        >
          <Play className="w-4 h-4 mr-2" />
          {schedulerActive ? "Stop Scheduler" : "Start Scheduler"}
        </Button>
      </div>

      {/* Basic Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Basic Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="days-between">Days Between Follow-ups</Label>
            <Input
              id="days-between"
              type="number"
              value={daysBetween}
              onChange={(e) => setDaysBetween(e.target.value)}
              data-testid="input-days-between"
            />
            <p className="text-sm text-muted-foreground">Wait this many days before sending the next follow-up</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-followups">Maximum Follow-ups</Label>
            <Input
              id="max-followups"
              type="number"
              value={maxFollowups}
              onChange={(e) => setMaxFollowups(e.target.value)}
              data-testid="input-max-followups"
            />
            <p className="text-sm text-muted-foreground">Maximum number of follow-up emails to send per prospect</p>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Advanced Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="followup-type">Follow-up Type</Label>
            <Select value={followupType} onValueChange={setFollowupType}>
              <SelectTrigger id="followup-type" data-testid="select-followup-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gentle_reminder">Gentle Reminder</SelectItem>
                <SelectItem value="value_proposition">Value Proposition</SelectItem>
                <SelectItem value="urgency">Urgency-Based</SelectItem>
                <SelectItem value="question">Question-Based</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Soft, non-pushy follow-up</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger-condition">Trigger Condition</Label>
            <Select value={triggerCondition} onValueChange={setTriggerCondition}>
              <SelectTrigger id="trigger-condition" data-testid="select-trigger-condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_response">No Response</SelectItem>
                <SelectItem value="opened_no_reply">Opened but No Reply</SelectItem>
                <SelectItem value="clicked_no_reply">Clicked but No Reply</SelectItem>
                <SelectItem value="time_based">Time-Based</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Prospect has not replied</p>
          </div>

          <div className="space-y-2">
            <Label>Reference Content (Optional)</Label>
            {contentItems.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search content..."
                  value={contentSearch}
                  onChange={(e) => setContentSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-content"
                />
              </div>
            )}
            <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
              {contentItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No content available</p>
              ) : filteredContent.length === 0 ? (
                <div className="text-center py-4">
                  <Search className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No content matches your search</p>
                </div>
              ) : (
                filteredContent.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      id={`content-${item.id}`}
                      checked={selectedContent.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedContent([...selectedContent, item.id]);
                        } else {
                          setSelectedContent(selectedContent.filter(id => id !== item.id));
                        }
                      }}
                      data-testid={`checkbox-content-${item.id}`}
                    />
                    <label htmlFor={`content-${item.id}`} className="flex-1 text-sm cursor-pointer">
                      {item.title}
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Follow-up Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Follow-up Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Total Follow-ups Sent</p>
            </div>
            <div>
              <p className="text-3xl font-bold">0.0</p>
              <p className="text-sm text-muted-foreground">Avg per Prospect</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Follow-ups for Prospects */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Schedule Follow-ups for Prospects</CardTitle>
          <CardDescription>{selectedProspects.length} selected</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search prospects by name, company, or email..."
              value={prospectSearch}
              onChange={(e) => setProspectSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search-prospects"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="select-all"
              checked={filteredProspects.length > 0 && filteredProspects.every((p: any) => selectedProspects.includes(p.id))}
              onChange={handleSelectAll}
              data-testid="checkbox-select-all"
            />
            <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
              Select All {filteredProspects.length > 0 && filteredProspects.length !== prospects.length && `(${filteredProspects.length})`}
            </label>
          </div>

          <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
            {prospects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No prospects enrolled in this sequence
              </p>
            ) : filteredProspects.length === 0 ? (
              <div className="text-center py-8">
                <Search className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No prospects match your search</p>
              </div>
            ) : (
              filteredProspects.map((item: any) => {
                const prospectData = item.prospect || item;
                const displayName = prospectData.fullName || `${prospectData.firstName || ''} ${prospectData.lastName || ''}`.trim();

                return (
                  <div key={item.id} className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      id={`prospect-${item.id}`}
                      checked={selectedProspects.includes(item.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProspects([...selectedProspects, item.id]);
                        } else {
                          setSelectedProspects(selectedProspects.filter(id => id !== item.id));
                        }
                      }}
                      data-testid={`checkbox-prospect-${item.id}`}
                    />
                    <label htmlFor={`prospect-${item.id}`} className="flex-1 text-sm cursor-pointer">
                      {displayName} - {prospectData.companyName || 'No company'}
                    </label>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handlePreviewEmail}
              disabled={selectedProspects.length === 0 || previewMutation.isPending}
              variant="outline"
              className="flex-1"
              data-testid="button-preview-email"
            >
              {previewMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating Preview...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Email
                </>
              )}
            </Button>
            <Button
              onClick={handleScheduleFollowups}
              disabled={selectedProspects.length === 0}
              className="flex-1"
              data-testid="button-schedule-followups"
            >
              Schedule for {selectedProspects.length} prospects
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI Follow-up Email Preview</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Subject</Label>
                <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border">
                  {previewData.subject}
                </div>
              </div>
              <div>
                <Label className="text-sm font-semibold">Email Body</Label>
                <div className="mt-1 p-4 bg-gray-50 dark:bg-gray-800 rounded-md border whitespace-pre-wrap">
                  {previewData.body}
                </div>
              </div>
              {previewData.personalizationScore !== undefined && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold">Personalization Score:</Label>
                  <Badge variant={previewData.personalizationScore >= 80 ? "default" : "secondary"}>
                    {previewData.personalizationScore}%
                  </Badge>
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => {
                    setShowPreview(false);
                    handleScheduleFollowups();
                  }}
                  className="flex-1"
                  data-testid="button-schedule-from-preview"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Schedule for {selectedProspects.length} prospects
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowPreview(false)}
                  data-testid="button-close-preview"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
