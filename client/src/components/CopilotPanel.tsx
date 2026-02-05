import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageCircle,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
  Info,
  X,
  Bot,
  User,
} from "lucide-react";

interface CopilotResponse {
  answer: string;
  root_cause?: string;
  evidence?: string[];
  confidence: number;
  recommended_action?: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface Message {
  id: string;
  role: "user" | "copilot";
  content: string;
  response?: CopilotResponse;
  timestamp: Date;
}

interface CopilotContext {
  page: "health" | "failed-emails" | "stuck-queue" | "retry-queue";
  email_ids?: string[];
  queue_ids?: string[];
  metrics?: {
    deliveryRate?: number;
    failureRate?: number;
    queueDepth?: number;
    stuckCount?: number;
  };
}

interface CopilotPanelProps {
  context?: CopilotContext;
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTED_QUESTIONS = [
  "Why are emails failing?",
  "What is stuck in the queue?",
  "How many retries are pending?",
  "What is the current delivery rate?",
];

export function CopilotPanel({ context, isOpen, onClose }: CopilotPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const copilotMutation = useMutation({
    mutationFn: async (question: string) => {
      const payload: Record<string, unknown> = { question };
      
      if (context?.email_ids?.length) {
        payload.email_ids = context.email_ids;
      }
      if (context?.queue_ids?.length) {
        payload.queue_ids = context.queue_ids;
      }
      if (context?.metrics) {
        payload.metrics_context = context.metrics;
      }
      
      const response = await apiRequest("POST", "/api/copilot/query", payload);
      return response.json() as Promise<CopilotResponse>;
    },
    onSuccess: (data, question) => {
      const responseMessage: Message = {
        id: `copilot-${Date.now()}`,
        role: "copilot",
        content: data.answer,
        response: data,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, responseMessage]);
    },
    onError: (error) => {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "copilot",
        content: "Unable to process your question. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || copilotMutation.isPending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    copilotMutation.mutate(input.trim());
    setInput("");
  };

  const handleSuggestedQuestion = (question: string) => {
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    copilotMutation.mutate(question);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      default:
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    }
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 80) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (confidence >= 50) return <Info className="h-4 w-4 text-yellow-500" />;
    return <AlertCircle className="h-4 w-4 text-red-500" />;
  };

  if (!isOpen) return null;

  return (
    <Card
      className="fixed right-4 bottom-4 w-96 h-[600px] flex flex-col shadow-xl z-50 border-2"
      data-testid="copilot-panel"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <CardTitle className="text-lg">Ask Copilot</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          data-testid="copilot-close-button"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center py-4">
                Ask questions about your system health, failures, and queue status.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Suggested questions:
                </p>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-left h-auto py-2"
                    onClick={() => handleSuggestedQuestion(q)}
                    disabled={copilotMutation.isPending}
                    data-testid={`suggested-question-${q.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <MessageCircle className="h-3 w-3 mr-2 flex-shrink-0" />
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {msg.role === "copilot" && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800"
                    }`}
                    data-testid={`message-${msg.id}`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    
                    {msg.response && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="secondary"
                            className={getSeverityColor(msg.response.severity)}
                          >
                            {msg.response.severity}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {getConfidenceIcon(msg.response.confidence * 100)}
                            <span>{Math.round(msg.response.confidence * 100)}% confidence</span>
                          </div>
                        </div>
                        
                        {msg.response.root_cause && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Root cause:</span>{" "}
                            {msg.response.root_cause}
                          </p>
                        )}
                        
                        {msg.response.evidence && msg.response.evidence.length > 0 && (
                          <div className="text-xs">
                            <span className="font-medium text-muted-foreground">
                              Evidence:
                            </span>
                            <ul className="list-disc list-inside text-muted-foreground mt-1">
                              {msg.response.evidence.slice(0, 3).map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {msg.response.recommended_action && (
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            <span className="font-medium">Recommended:</span>{" "}
                            {msg.response.recommended_action}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              
              {copilotMutation.isPending && (
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <form
          onSubmit={handleSubmit}
          className="p-4 border-t flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about system health..."
            disabled={copilotMutation.isPending}
            data-testid="copilot-input"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || copilotMutation.isPending}
            data-testid="copilot-send-button"
          >
            {copilotMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function CopilotButton({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      size="lg"
      className={`fixed right-4 bottom-4 rounded-full w-14 h-14 shadow-lg z-40 ${
        isOpen ? "hidden" : ""
      }`}
      data-testid="copilot-toggle-button"
    >
      <Bot className="h-6 w-6" />
    </Button>
  );
}
