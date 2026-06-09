import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MessageSquare, RefreshCw, Zap, Send, Loader2 } from "lucide-react";

function AIReplyComposer({ reply, sequenceId, open, onOpenChange }: { reply: any; sequenceId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generateReplyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sequences/${sequenceId}/generate-reply`, {
        replyId: reply.id,
        prospectId: reply.prospectId,
        replyContent: reply.replyContent
      });
      return await res.json();
    },
    onSuccess: (data) => {
      setGeneratedEmail(data.email || "");
      setIsGenerating(false);
      toast({
        title: "Reply generated",
        description: "Your AI-generated reply is ready for review.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate reply",
        variant: "destructive",
      });
    }
  });

  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sequences/send-reply`, {
        prospectId: reply.prospectId,
        sequenceId,
        subject: `Re: ${reply.subject || 'Your inquiry'}`,
        body: generatedEmail,
      });
      return await res.json();
    },
    onSuccess: () => {
      onOpenChange(false);
      setGeneratedEmail("");
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'replies'] });
      toast({
        title: "Reply Sent",
        description: "Your reply has been queued and will be sent within 10 seconds",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Send Failed",
        description: error.message || "Failed to send reply",
        variant: "destructive",
      });
    }
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generateReplyMutation.mutate();
  };

  const handleSendReply = () => {
    if (generatedEmail.trim()) {
      sendReplyMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>AI Reply Composer</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 p-4">
          <div>
            <Label className="text-sm font-medium">Original Reply from {reply.prospect?.fullName}</Label>
            <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
              {reply.replyContent}
            </div>
          </div>

          {!generatedEmail && !generateReplyMutation.isPending && (
            <Button
              onClick={handleGenerate}
              className="w-full"
              data-testid="button-generate-ai-reply"
            >
              <Zap className="w-4 h-4 mr-2" />
              Generate AI Reply
            </Button>
          )}

          {generateReplyMutation.isPending && (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">Generating personalized reply...</p>
            </div>
          )}

          {generatedEmail && (
            <div>
              <Label className="text-sm font-medium">Generated Reply</Label>
              <Textarea
                value={generatedEmail}
                onChange={(e) => setGeneratedEmail(e.target.value)}
                className="mt-2 min-h-[200px]"
                data-testid="textarea-generated-reply"
              />
            </div>
          )}
        </div>

        <div className="border-t px-4 py-4 flex justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-reply">
            Cancel
          </Button>
          {generatedEmail && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleGenerate} data-testid="button-regenerate-reply">
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
              <Button
                onClick={handleSendReply}
                disabled={sendReplyMutation.isPending || !generatedEmail.trim()}
                data-testid="button-send-reply"
              >
                {sendReplyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" />
                Send Reply
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RepliesTab({ sequenceId, replies }: { sequenceId: string; replies: any[] }) {
  const queryClient = useQueryClient();
  const [selectedReply, setSelectedReply] = useState<any>(null);

  const { data: sequence } = useQuery({
    queryKey: ['/api/sequences', sequenceId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}`, undefined);
      return await res.json();
    },
  });

  const { data: prospectsData } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'prospects'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/prospects`, undefined);
      return await res.json();
    },
  });

  const totalReplies = replies?.length || 0;
  const totalProspects = prospectsData?.prospects?.length || 0;
  const uniqueProspectsReplied = new Set(replies?.map((r: any) => r.prospectId) || []).size;
  const responseRate = totalProspects > 0 ? Math.round((uniqueProspectsReplied / totalProspects) * 100) : 0;
  const latestReply = replies?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6" />
            Email Replies - {sequence?.name || 'Sequence'}
          </h2>
          <p className="text-muted-foreground mt-1">
            {uniqueProspectsReplied} prospects replied to this sequence
          </p>
        </div>
        <Button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'replies'] })}
          variant="outline"
          size="sm"
          data-testid="button-refresh-replies"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-sm font-medium">Total Replies</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600 dark:text-green-500">{totalReplies}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-sm font-medium text-blue-600 dark:text-blue-500">Response Rate</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-500">{responseRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="text-sm font-medium text-purple-600 dark:text-purple-500">Latest Reply</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-base font-medium text-purple-600 dark:text-purple-500">
              {latestReply ? new Date(latestReply.receivedAt).toLocaleString() : 'No replies yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      {!replies || replies.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-20 h-20 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Replies Yet</h3>
          <p className="text-muted-foreground">
            When prospects reply to emails in this sequence, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {replies.map((reply: any) => (
            <Card key={reply.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {reply.prospect?.fullName || 'Unknown Prospect'}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={reply.sentiment === 'positive' ? 'default' : 'secondary'}>
                      {reply.sentiment || 'neutral'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedReply(reply)}
                      data-testid={`button-generate-followup-${reply.id}`}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      AI Follow-up
                    </Button>
                  </div>
                </div>
                <CardDescription>{new Date(reply.receivedAt).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Reply Content:</p>
                    <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg">{reply.replyContent}</p>
                  </div>
                  {reply.prospect && (
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{reply.prospect.companyName || 'No company'}</span>
                      <span>{reply.prospect.jobTitle || 'No title'}</span>
                      <span>{reply.prospect.primaryEmail || 'No email'}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedReply && (
        <AIReplyComposer
          reply={selectedReply}
          sequenceId={sequenceId}
          open={!!selectedReply}
          onOpenChange={(open) => {
            if (!open) setSelectedReply(null);
          }}
        />
      )}
    </div>
  );
}
