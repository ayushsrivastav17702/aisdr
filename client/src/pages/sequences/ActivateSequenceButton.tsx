import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Pause } from "lucide-react";

export function ActivateSequenceButton({
  sequenceId,
  currentStatus,
  hasSteps,
  hasProspects
}: {
  sequenceId: string;
  currentStatus: string;
  hasSteps: boolean;
  hasProspects: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
        description: "Your sequence is now active and emails will be sent to enrolled prospects."
      });
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
    </div>
  );
}
