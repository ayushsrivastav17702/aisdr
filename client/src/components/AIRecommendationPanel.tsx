import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { 
  Sparkles, 
  ArrowRight, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface AIRecommendation {
  templateName: string;
  reasoning: string;
  suggestedMessage: {
    subject: string;
    body: string;
  };
  warning?: string;
  backupOption?: {
    templateName: string;
    subject: string;
    body: string;
  };
  context?: {
    campaignStage: string;
    daysSinceLastTouch: number;
    replyType?: string;
    triggerDetected?: string;
  };
}

interface AIRecommendationPanelProps {
  recommendation: AIRecommendation | null;
  isLoading?: boolean;
  onUseMessage: (subject: string, body: string) => void;
  onSeeAlternative?: () => void;
  onRefresh?: () => void;
  compact?: boolean;
}

export function AIRecommendationPanel({
  recommendation,
  isLoading = false,
  onUseMessage,
  onSeeAlternative,
  onRefresh,
  compact = false
}: AIRecommendationPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [showBackup, setShowBackup] = useState(false);
  const { toast } = useToast();

  const handleCopyMessage = (subject: string, body: string) => {
    const text = `Subject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Message copied successfully",
    });
  };

  if (isLoading) {
    return (
      <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20" data-testid="panel-ai-recommendation-loading">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/50">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-pulse" />
            </div>
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!recommendation) {
    return null;
  }

  const currentMessage = showBackup && recommendation.backupOption 
    ? recommendation.backupOption 
    : recommendation.suggestedMessage;

  return (
    <Card 
      className="border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20"
      data-testid="panel-ai-recommendation"
    >
      <CardContent className={compact && !isExpanded ? "p-3" : "p-4"}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/50 shrink-0">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300" data-testid="badge-ai-recommendation">
                  AI Recommendation
                </Badge>
                <span className="text-sm font-medium text-foreground" data-testid="text-template-name">
                  {showBackup && recommendation.backupOption ? recommendation.backupOption.templateName : recommendation.templateName}
                </span>
                {recommendation.context?.campaignStage && (
                  <Badge variant="outline" className="text-xs" data-testid="badge-campaign-stage">
                    {recommendation.context.campaignStage}
                  </Badge>
                )}
              </div>

              {(isExpanded || !compact) && (
                <>
                  <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                    <Lightbulb className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                    <p data-testid="text-recommendation-reasoning">{recommendation.reasoning}</p>
                  </div>

                  {recommendation.warning && (
                    <div className="mt-3 flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="text-recommendation-warning">
                        <span className="font-medium">Avoid:</span> {recommendation.warning}
                      </p>
                    </div>
                  )}

                  <Separator className="my-3" />

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Suggested Message
                    </p>
                    <div className="p-3 rounded-md bg-white dark:bg-gray-900 border">
                      <p className="text-sm font-medium mb-2" data-testid="text-suggested-subject">
                        Subject: {currentMessage.subject}
                      </p>
                      <div 
                        className="text-sm text-muted-foreground whitespace-pre-wrap"
                        data-testid="text-suggested-body"
                        dangerouslySetInnerHTML={{ 
                          __html: currentMessage.body.replace(/<[^>]*>/g, '').substring(0, 500) + 
                            (currentMessage.body.length > 500 ? '...' : '')
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <Button 
                      onClick={() => onUseMessage(currentMessage.subject, currentMessage.body)}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="button-use-message"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Use This Message
                    </Button>
                    
                    {recommendation.backupOption && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowBackup(!showBackup)}
                        data-testid="button-see-alternative"
                      >
                        <ArrowRight className="h-4 w-4 mr-1" />
                        {showBackup ? "See Primary" : "See Alternative"}
                      </Button>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyMessage(currentMessage.subject, currentMessage.body)}
                      data-testid="button-copy-message"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>

                    {onRefresh && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRefresh}
                        data-testid="button-refresh-recommendation"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Refresh
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {compact && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0"
              data-testid="button-toggle-expand"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
