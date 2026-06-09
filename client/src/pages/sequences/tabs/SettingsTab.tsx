import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Trash2, Zap, BarChart3 } from "lucide-react";
import { AutomationModal } from "@/components/AutomationModal";

export function SettingsTab({ sequenceId, sequence }: { sequenceId: string; sequence: any }) {
  const [name, setName] = useState(sequence?.name || "");
  const [description, setDescription] = useState(sequence?.description || "");
  const [status, setStatus] = useState(sequence?.status || "draft");
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/sequences/${sequenceId}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      toast({ title: "Sequence updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/sequences/${sequenceId}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Sequence deleted successfully" });
      window.location.href = "/sequences";
    },
  });

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Sequence Settings</CardTitle>
        <CardDescription>Configure your sequence preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label>Sequence Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Email Sequence"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description of this sequence..."
            rows={3}
          />
        </div>

        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            onClick={() => updateMutation.mutate({ name, description, status })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm("Are you sure you want to delete this sequence? This action cannot be undone.")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Sequence
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-blue-600" />
          Automation
        </CardTitle>
        <CardDescription>Automatically import prospects and enroll them in this sequence</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-1">Automated Prospect Enrollment</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Automatically find prospects using Apollo.io or use existing prospects from your database,
                then enroll them in this sequence with optional AI-powered personalization.
              </p>
              <Button
                onClick={() => setShowAutomationModal(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                data-testid="button-start-automation"
              >
                <Zap className="w-4 h-4 mr-2" />
                Start Automation
              </Button>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Features:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Fetch prospects from Apollo.io with custom filters</li>
              <li>Use existing prospects from your database</li>
              <li>AI-powered email personalization</li>
              <li>Automatic sequence enrollment</li>
              <li>Real-time progress tracking</li>
            </ul>
          </div>

          <div className="pt-2">
            <Link href="/automation">
              <Button variant="outline" size="sm">
                <BarChart3 className="w-4 h-4 mr-2" />
                View Automation Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>

    {showAutomationModal && (
      <AutomationModal
        sequenceId={sequenceId}
        sequenceName={sequence?.name || ""}
        open={showAutomationModal}
        onClose={() => setShowAutomationModal(false)}
      />
    )}
  </>
  );
}
