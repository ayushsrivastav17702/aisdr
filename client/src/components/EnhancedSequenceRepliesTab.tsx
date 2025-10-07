import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Mail, Bot, TrendingUp, MessageCircle, Clock, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Reply {
  id: string;
  prospectId: string;
  replyContent: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'interested' | 'not_interested';
  receivedAt: string;
  aiSummary?: string;
  nextAction?: string;
  prospect?: {
    fullName: string;
    primaryEmail: string;
    companyName: string;
  };
}

interface EnhancedSequenceRepliesTabProps {
  sequenceId: string;
}

export function EnhancedSequenceRepliesTab({ sequenceId }: EnhancedSequenceRepliesTabProps) {
  const { toast } = useToast();

  const { data: replies, isLoading } = useQuery<Reply[]>({
    queryKey: ['/api/sequences', sequenceId, 'replies'],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const analyzeResponseMutation = useMutation({
    mutationFn: async (replyId: string) => {
      return await apiRequest(
        'POST',
        `/api/sequences/analyze-response`,
        { replyId }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'replies'] });
      toast({
        title: 'Analysis Complete',
        description: 'AI sentiment analysis completed successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Failed to analyze response',
        variant: 'destructive',
      });
    },
  });

  const generateFollowUpMutation = useMutation({
    mutationFn: async (prospectId: string) => {
      return await apiRequest(
        'GET',
        `/api/sequences/ai-followup-preview/${prospectId}`
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Follow-up Preview',
        description: `AI generated: ${data.preview?.subject || 'New follow-up email'}`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate follow-up',
        variant: 'destructive',
      });
    },
  });

  const getSentimentColor = (sentiment: Reply['sentiment']) => {
    switch (sentiment) {
      case 'positive':
      case 'interested':
        return 'bg-green-500';
      case 'negative':
      case 'not_interested':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getSentimentLabel = (sentiment: Reply['sentiment']) => {
    return sentiment.replace('_', ' ').toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!replies || replies.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-64 text-center">
          <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">No Replies Yet</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Email replies will appear here automatically
          </p>
          <Badge variant="outline" className="mt-4">
            Auto-refresh: 30s
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="enhanced-replies-tab">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Email Replies ({replies.length})</h3>
          <p className="text-sm text-muted-foreground">
            Real-time reply tracking with AI sentiment analysis
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Auto-refresh
        </Badge>
      </div>

      <div className="space-y-4">
        {replies.map((reply) => (
          <Card key={reply.id} data-testid={`card-reply-${reply.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {reply.prospect?.fullName || 'Unknown Prospect'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {reply.prospect?.companyName} • {reply.prospect?.primaryEmail}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    className={`${getSentimentColor(reply.sentiment)} text-white`}
                    data-testid={`badge-sentiment-${reply.sentiment}`}
                  >
                    {getSentimentLabel(reply.sentiment)}
                  </Badge>
                  <Badge variant="outline">
                    {formatDistanceToNow(new Date(reply.receivedAt), { addSuffix: true })}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold mb-2">Reply Content</p>
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{reply.replyContent}</p>
                </div>
              </div>

              {reply.aiSummary && (
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <Bot className="w-4 h-4" />
                    AI Summary
                  </p>
                  <p className="text-sm text-muted-foreground">{reply.aiSummary}</p>
                </div>
              )}

              {reply.nextAction && (
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    Recommended Next Action
                  </p>
                  <p className="text-sm text-muted-foreground">{reply.nextAction}</p>
                </div>
              )}

              <Separator />

              <div className="flex gap-2">
                {!reply.aiSummary && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => analyzeResponseMutation.mutate(reply.id)}
                    disabled={analyzeResponseMutation.isPending}
                    data-testid={`button-analyze-${reply.id}`}
                  >
                    {analyzeResponseMutation.isPending && (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    )}
                    <Bot className="mr-2 h-3 w-3" />
                    Analyze with AI
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateFollowUpMutation.mutate(reply.prospectId)}
                  disabled={generateFollowUpMutation.isPending}
                  data-testid={`button-followup-${reply.id}`}
                >
                  {generateFollowUpMutation.isPending && (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  )}
                  <Sparkles className="mr-2 h-3 w-3" />
                  Generate AI Follow-up
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // This would open the email client with a reply draft
                    window.open(`mailto:${reply.prospect?.primaryEmail}`, '_blank');
                  }}
                  data-testid={`button-reply-${reply.id}`}
                >
                  <MessageCircle className="mr-2 h-3 w-3" />
                  Reply Manually
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
