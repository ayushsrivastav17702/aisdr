import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Pause } from "lucide-react";
import { SequenceApprovalPreview } from "@/components/SequenceApprovalPreview";

export function ActivateSequenceButton({
  sequenceId,
  sequenceName,
  currentStatus,
  hasSteps,
  hasProspects
}: {
  sequenceId: string;
  sequenceName?: string;
  currentStatus: string;
  hasSteps: boolean;
  hasProspects: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // P0 FIX 4: Show the AI email approval preview after activation, before
  // any emails are actually approved for sending.
  const [showApprovalPreview, setShowApprovalPreview] = useState(false);

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/sequences/${sequenceId}`, {
        status: "active"
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences'] });
      toast({
        title: "Sequence activated!",
        description: "Review and approve the AI-generated emails before they are sent."
      });
      // P0 FIX 4: Surface the approval preview immediately after activation
      // so the user can review AI emails before they go out.
      setShowApprovalPreview(true);
    },
    onError: () => {
      toast({
        title: "Failed to activate sequence",
        variant: "destructive"
      });
    }
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/sequences/${sequenceId}`, {
        status: "paused"
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences'] });
      toast({
        title: "Sequence paused",
        description: "Email sending has been paused."
      });
    },
    onError: () => {
      toast({
        title: "Failed to pause sequence",
        variant: "destructive"
      });
    }
  });

  if (currentStatus === "active") {
    return (
      <Button
        variant="outline"
        onClick={() => pauseMutation.mutate()}
        disabled={pauseMutation.isPending}
        data-testid="button-pause-sequence"
      >
        <Pause className="w-4 h-4 mr-2" />
        {pauseMutation.isPending ? "Pausing..." : "Pause Sequence"}
      </Button>
    );
  }

  const isDisabled = !hasSteps || !hasProspects;
  const tooltipMessage = !hasSteps
    ? "Add at least one email step to activate"
    : !hasProspects
    ? "Enroll prospects to activate"
    : "";

  return (
    <div className="relative group">
      <Button
        onClick={() => activateMutation.mutate()}
        disabled={isDisabled || activateMutation.isPending}
        className="bg-green-600 hover:bg-green-700 text-white"
        data-testid="button-activate-sequence"
      >
        <Play className="w-4 h-4 mr-2" />
        {activateMutation.isPending ? "Activating..." : "Activate Sequence"}
      </Button>
      {isDisabled && (
        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {tooltipMessage}
        </div>
      )}

      {/* P0 FIX 4: Approval preview shown right after activation so the user
          can review AI-generated emails before they are approved for sending. */}
      <SequenceApprovalPreview
        sequenceId={sequenceId}
        sequenceName={sequenceName || ""}
        open={showApprovalPreview}
        onClose={() => setShowApprovalPreview(false)}
        onApprove={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
          queryClient.invalidateQueries({ queryKey: ['/api/sequences'] });
        }}
      />
    </div>
  );
}
