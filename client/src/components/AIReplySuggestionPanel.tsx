import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { 
  Sparkles, 
  MessageSquare,
  Send,
  Edit2,
  Copy,
  RefreshCw,
  AlertTriangle,
  X,
  CheckCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export interface ReplySuggestion {
  detectedType: 'objection' | 'question' | 'interested' | 'not_now' | 'send_info' | 'neutral';
  detectedLabel: string;
  suggestedReply: string;
  reasoning: string;
  warning?: string;
  restrictions?: {
    blockAttachments?: boolean;
    blockDecks?: boolean;
    forceSingleQuestion?: boolean;
  };
}

interface AIReplySuggestionPanelProps {
  suggestion: ReplySuggestion | null;
  isLoading?: boolean;
  onInsertReply: (reply: string) => void;
  onRefresh?: () => void;
  onDismiss?: () => void;
  prospectReply?: string;
}

const typeColors: Record<string, string> = {
  objection: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  question: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  interested: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  not_now: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  send_info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
};

export function AIReplySuggestionPanel({
  suggestion,
  isLoading = false,
  onInsertReply,
  onRefresh,
  onDismiss,
  prospectReply
}: AIReplySuggestionPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedReply, setEditedReply] = useState('');
  const { toast } = useToast();

  const handleStartEdit = () => {
    if (suggestion) {
      setEditedReply(suggestion.suggestedReply);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (editedReply.trim()) {
      onInsertReply(editedReply);
      setIsEditing(false);
    }
  };

  const handleCopy = () => {
    if (suggestion) {
      navigator.clipboard.writeText(suggestion.suggestedReply);
      toast({
        title: "Copied to clipboard",
        description: "Reply copied successfully",
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="border-purple-200 dark:border-purple-800" data-testid="panel-reply-suggestion-loading">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-pulse" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (!suggestion) {
    return null;
  }

  return (
    <Card 
      className="border-purple-200 dark:border-purple-800 bg-gradient-to-b from-purple-50/30 to-white dark:from-purple-950/20 dark:to-gray-900"
      data-testid="panel-reply-suggestion"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <CardTitle className="text-sm font-medium">AI Reply Suggestion</CardTitle>
          </div>
          {onDismiss && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
              onClick={onDismiss}
              data-testid="button-dismiss-suggestion"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge 
            variant="secondary" 
            className={typeColors[suggestion.detectedType] || typeColors.neutral}
            data-testid="badge-detected-type"
          >
            {suggestion.detectedLabel}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground" data-testid="text-suggestion-reasoning">
          {suggestion.reasoning}
        </p>

        {suggestion.warning && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="text-suggestion-warning">
              {suggestion.warning}
            </p>
          </div>
        )}

        {suggestion.restrictions && (
          <div className="flex flex-wrap gap-1.5">
            {suggestion.restrictions.blockAttachments && (
              <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950/30 text-red-600" data-testid="badge-restriction-attachments">
                No attachments
              </Badge>
            )}
            {suggestion.restrictions.blockDecks && (
              <Badge variant="outline" className="text-xs bg-red-50 dark:bg-red-950/30 text-red-600" data-testid="badge-restriction-decks">
                No decks
              </Badge>
            )}
            {suggestion.restrictions.forceSingleQuestion && (
              <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-600" data-testid="badge-restriction-single-question">
                Single question only
              </Badge>
            )}
          </div>
        )}

        <Separator />

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Best Response
          </p>
          
          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editedReply}
                onChange={(e) => setEditedReply(e.target.value)}
                className="min-h-[120px] text-sm"
                placeholder="Edit your reply..."
                data-testid="textarea-edit-reply"
              />
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  onClick={handleSaveEdit}
                  data-testid="button-save-edit"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Use This
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div 
              className="p-3 rounded-md bg-white dark:bg-gray-800 border text-sm whitespace-pre-wrap"
              data-testid="text-suggested-reply"
            >
              {suggestion.suggestedReply}
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              size="sm"
              onClick={() => onInsertReply(suggestion.suggestedReply)}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-insert-reply"
            >
              <Send className="h-4 w-4 mr-1" />
              Insert Reply
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartEdit}
              data-testid="button-edit-reply"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              data-testid="button-copy-reply"
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>

            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                data-testid="button-refresh-suggestion"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
