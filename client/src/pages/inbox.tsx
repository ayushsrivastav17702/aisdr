import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Inbox,
  Mail,
  MailOpen,
  Reply,
  Archive,
  Star,
  StarOff,
  Filter,
  Search,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Building,
  MessageSquare,
  Sparkles,
  MoreVertical,
} from "lucide-react";
import { AIReplySuggestionPanel, type ReplySuggestion } from "@/components/AIReplySuggestionPanel";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EmailReply, Prospect, Email } from "@shared/schema";

type ReplyWithDetails = EmailReply & {
  prospect?: Prospect;
  email?: Email;
};

const sentimentColors: Record<string, string> = {
  positive: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  negative: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  neutral: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  unsubscribe: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

const intentLabels: Record<string, { label: string; color: string }> = {
  interested: { label: "Interested", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  meeting_request: { label: "Meeting Request", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  not_now: { label: "Not Now", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  question: { label: "Question", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  objection: { label: "Objection", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  unsubscribe: { label: "Unsubscribe", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  ooo: { label: "Out of Office", color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300" },
  bounce: { label: "Bounced", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

export default function InboxPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedReply, setSelectedReply] = useState<ReplyWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [aiSuggestion, setAiSuggestion] = useState<ReplySuggestion | null>(null);
  const [isLoadingAiSuggestion, setIsLoadingAiSuggestion] = useState(false);

  const { data: replies, isLoading } = useQuery<ReplyWithDetails[]>({
    queryKey: ["/api/inbox/replies"],
  });

  const { data: stats } = useQuery<{
    total: number;
    unread: number;
    positive: number;
    needsAction: number;
  }>({
    queryKey: ["/api/inbox/stats"],
  });

  const markAsReadMutation = useMutation({
    mutationFn: (replyId: string) =>
      apiRequest("POST", `/api/inbox/replies/${replyId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/replies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/stats"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (replyId: string) =>
      apiRequest("POST", `/api/inbox/replies/${replyId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox/replies"] });
      setSelectedReply(null);
    },
  });

  const filteredReplies = replies?.filter((reply) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesContent = reply.replyContent?.toLowerCase().includes(query);
      const matchesProspect = reply.prospect?.fullName?.toLowerCase().includes(query) ||
        reply.prospect?.companyName?.toLowerCase().includes(query) ||
        reply.prospect?.primaryEmail?.toLowerCase().includes(query);
      if (!matchesContent && !matchesProspect) return false;
    }
    if (sentimentFilter !== "all" && reply.sentiment !== sentimentFilter) return false;
    if (intentFilter !== "all" && reply.intent !== intentFilter) return false;
    return true;
  }) || [];

  const handleSelectReply = (reply: ReplyWithDetails) => {
    setSelectedReply(reply);
    setAiSuggestion(null);
    if (!reply.processed) {
      markAsReadMutation.mutate(reply.id);
    }
  };

  const fetchAiSuggestion = async (reply: ReplyWithDetails) => {
    if (!reply.replyContent) return;
    
    setIsLoadingAiSuggestion(true);
    try {
      const response = await apiRequest('POST', '/api/ai/suggest-reply', {
        prospectId: reply.prospectId,
        replyContent: reply.replyContent,
        replyType: reply.replyType,
        sentiment: reply.sentiment,
        intent: reply.intent
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiSuggestion(data);
      } else {
        console.error('Failed to fetch AI suggestion:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch AI suggestion:', error);
    } finally {
      setIsLoadingAiSuggestion(false);
    }
  };

  useEffect(() => {
    if (selectedReply && (selectedReply.intent === 'objection' || selectedReply.intent === 'question' || selectedReply.intent === 'not_now')) {
      fetchAiSuggestion(selectedReply);
    }
  }, [selectedReply?.id, selectedReply?.intent]);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-page-title">
            Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all your email replies in one place
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" data-testid="button-refresh">
            <Mail className="h-4 w-4 mr-2" />
            Check for Replies
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6" data-testid="container-stats">
        <Card data-testid="card-stat-total">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Inbox className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold" data-testid="text-total-replies">
                  {stats?.total || 0}
                </p>
                <p className="text-xs text-muted-foreground">Total Replies</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-unread">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <MailOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold" data-testid="text-unread-count">
                  {stats?.unread || 0}
                </p>
                <p className="text-xs text-muted-foreground">Unread</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-positive">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold" data-testid="text-positive-count">
                  {stats?.positive || 0}
                </p>
                <p className="text-xs text-muted-foreground">Positive</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-action">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold" data-testid="text-action-needed">
                  {stats?.needsAction || 0}
                </p>
                <p className="text-xs text-muted-foreground">Needs Action</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6" data-testid="container-main">
        {/* Reply List */}
        <div className="col-span-5" data-testid="container-reply-list">
          <Card className="h-[calc(100vh-320px)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search replies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" data-testid="button-filter">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="p-2">
                      <p className="text-xs font-medium mb-2">Sentiment</p>
                      <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                        <SelectTrigger className="h-8" data-testid="select-sentiment">
                          <SelectValue placeholder="All sentiments" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All sentiments</SelectItem>
                          <SelectItem value="positive">Positive</SelectItem>
                          <SelectItem value="negative">Negative</SelectItem>
                          <SelectItem value="neutral">Neutral</SelectItem>
                          <SelectItem value="unsubscribe">Unsubscribe</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium mb-2">Intent</p>
                      <Select value={intentFilter} onValueChange={setIntentFilter}>
                        <SelectTrigger className="h-8" data-testid="select-intent">
                          <SelectValue placeholder="All intents" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All intents</SelectItem>
                          <SelectItem value="interested">Interested</SelectItem>
                          <SelectItem value="meeting_request">Meeting Request</SelectItem>
                          <SelectItem value="question">Question</SelectItem>
                          <SelectItem value="objection">Objection</SelectItem>
                          <SelectItem value="not_now">Not Now</SelectItem>
                          <SelectItem value="ooo">Out of Office</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-420px)]">
                {isLoading ? (
                  <div className="p-4 space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : filteredReplies.length === 0 ? (
                  <div className="p-8 text-center" data-testid="container-empty-state">
                    <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground" data-testid="text-empty-message">No replies found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredReplies.map((reply) => (
                      <div
                        key={reply.id}
                        onClick={() => handleSelectReply(reply)}
                        className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedReply?.id === reply.id ? "bg-muted" : ""
                        } ${!reply.processed ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                        data-testid={`card-reply-${reply.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm truncate" data-testid={`text-reply-name-${reply.id}`}>
                                {reply.prospect?.fullName || "Unknown Prospect"}
                              </p>
                              {!reply.processed && (
                                <div className="h-2 w-2 rounded-full bg-blue-500" data-testid={`indicator-unread-${reply.id}`} />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mb-1" data-testid={`text-reply-company-${reply.id}`}>
                              {reply.prospect?.companyName || ""}
                            </p>
                            <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-reply-preview-${reply.id}`}>
                              {reply.replyContent?.substring(0, 100)}...
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <p className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-reply-time-${reply.id}`}>
                              {reply.receivedAt
                                ? formatDistanceToNow(new Date(reply.receivedAt), { addSuffix: true })
                                : ""}
                            </p>
                            {reply.sentiment && (
                              <Badge
                                variant="secondary"
                                className={`text-xs ${sentimentColors[reply.sentiment] || ""}`}
                                data-testid={`badge-sentiment-${reply.id}`}
                              >
                                {reply.sentiment}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {reply.intent && intentLabels[reply.intent] && (
                          <Badge
                            variant="outline"
                            className={`mt-2 text-xs ${intentLabels[reply.intent].color}`}
                            data-testid={`badge-intent-${reply.id}`}
                          >
                            {intentLabels[reply.intent].label}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Reply Detail */}
        <div className="col-span-7" data-testid="container-reply-detail">
          <Card className="h-[calc(100vh-320px)]">
            {selectedReply ? (
              <>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold" data-testid="text-prospect-name">
                          {selectedReply.prospect?.fullName || "Unknown Prospect"}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building className="h-3 w-3" />
                          <span data-testid="text-detail-company">{selectedReply.prospect?.companyName || "Unknown Company"}</span>
                          <span>•</span>
                          <span data-testid="text-detail-email">{selectedReply.prospect?.primaryEmail}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => archiveMutation.mutate(selectedReply.id)}
                        data-testid="button-archive"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid="button-more-actions">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => navigate(`/prospects?id=${selectedReply.prospectId}`)}
                            data-testid="menuitem-view-prospect"
                          >
                            View Prospect
                          </DropdownMenuItem>
                          <DropdownMenuItem data-testid="menuitem-mark-unread">Mark as Unread</DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" data-testid="menuitem-report-spam">Report Spam</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <Separator />
                <CardContent className="p-6">
                  <ScrollArea className="h-[calc(100vh-520px)]">
                    {/* AI Analysis */}
                    {selectedReply.aiSummary && (
                      <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="h-4 w-4 text-purple-600" />
                          <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                            AI Summary
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid="text-ai-summary">
                          {selectedReply.aiSummary}
                        </p>
                        {selectedReply.nextAction && (
                          <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                            <p className="text-xs font-medium text-purple-600 dark:text-purple-400">
                              Suggested Action
                            </p>
                            <p className="text-sm text-muted-foreground" data-testid="text-next-action">
                              {selectedReply.nextAction}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Classification Badges */}
                    <div className="flex items-center gap-2 mb-4" data-testid="container-badges">
                      {selectedReply.sentiment && (
                        <Badge className={sentimentColors[selectedReply.sentiment]} data-testid="badge-detail-sentiment">
                          Sentiment: {selectedReply.sentiment}
                        </Badge>
                      )}
                      {selectedReply.intent && intentLabels[selectedReply.intent] && (
                        <Badge className={intentLabels[selectedReply.intent].color} data-testid="badge-detail-intent">
                          {intentLabels[selectedReply.intent].label}
                        </Badge>
                      )}
                      {selectedReply.replyType && (
                        <Badge variant="outline" data-testid="badge-detail-type">{selectedReply.replyType}</Badge>
                      )}
                    </div>

                    {/* Email Content */}
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3" data-testid="text-detail-received">
                        <Clock className="h-3 w-3" />
                        Received {selectedReply.receivedAt 
                          ? formatDistanceToNow(new Date(selectedReply.receivedAt), { addSuffix: true })
                          : "recently"}
                      </div>
                      <div
                        className="whitespace-pre-wrap text-sm"
                        data-testid="text-reply-content"
                      >
                        {selectedReply.replyContent}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-6 pt-6 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-3">
                        Quick Actions
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" data-testid="button-compose-reply">
                          <Reply className="h-4 w-4 mr-2" />
                          Compose Reply
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => selectedReply && fetchAiSuggestion(selectedReply)}
                          disabled={isLoadingAiSuggestion}
                          data-testid="button-generate-reply"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          {isLoadingAiSuggestion ? 'Generating...' : 'Generate AI Reply'}
                        </Button>
                        {selectedReply.intent === "meeting_request" && (
                          <Button size="sm" variant="outline" data-testid="button-schedule-meeting">
                            <Clock className="h-4 w-4 mr-2" />
                            Schedule Meeting
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* AI Reply Suggestion Panel */}
                    {(aiSuggestion || isLoadingAiSuggestion) && (
                      <div className="mt-6 pt-6 border-t" data-testid="container-ai-suggestion">
                        <AIReplySuggestionPanel
                          suggestion={aiSuggestion}
                          isLoading={isLoadingAiSuggestion}
                          onInsertReply={(reply) => {
                            navigator.clipboard.writeText(reply);
                            toast({
                              title: "Reply copied",
                              description: "The suggested reply has been copied to your clipboard"
                            });
                          }}
                          onRefresh={() => selectedReply && fetchAiSuggestion(selectedReply)}
                          onDismiss={() => setAiSuggestion(null)}
                          prospectReply={selectedReply?.replyContent || undefined}
                        />
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Select a reply to view details
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
