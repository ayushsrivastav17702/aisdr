import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Shield,
  Target,
  Sparkles,
  Database,
} from "lucide-react";

interface ScoreBreakdown {
  reasonConfidence: number;
  dataQuality: number;
  personalizationDepth: number;
  total: number;
}

interface BlockedReason {
  rule: string;
  message: string;
  severity: "critical" | "high" | "medium";
}

interface SafeToSendDecisionData {
  canSend: boolean;
  finalScore: number;
  reasons: string[];
  blockedReasons: BlockedReason[];
  scoreBreakdown: ScoreBreakdown;
  auditId?: string;
}

interface FormattedDecision {
  title: string;
  summary: string;
  details: string[];
  type: "success" | "warning" | "error";
}

interface AuditResponse {
  audits: Array<{
    id: string;
    decision: string;
    finalScore: string;
    reasons: string[] | null;
    blockedReasons: BlockedReason[] | null;
    scoreBreakdown: ScoreBreakdown | null;
  }>;
  stats?: {
    total: number;
    sent: number;
    blocked: number;
    averageScore: number;
  };
}

interface SafeToSendDecisionProps {
  decision?: SafeToSendDecisionData;
  prospectId?: string;
  compact?: boolean;
}

export function SafeToSendDecision({
  decision,
  prospectId,
  compact = false,
}: SafeToSendDecisionProps) {
  const [isOpen, setIsOpen] = useState(!compact);

  const { data: prospectAudits } = useQuery<AuditResponse>({
    queryKey: ["/api/safe-to-send/prospect", prospectId, "audits"],
    enabled: !!prospectId && !decision,
  });

  const normalizeAudit = (audit: AuditResponse["audits"][0]): SafeToSendDecisionData => ({
    canSend: audit.decision === "send",
    finalScore: parseFloat(audit.finalScore),
    reasons: audit.reasons || [],
    blockedReasons: audit.blockedReasons || [],
    scoreBreakdown: audit.scoreBreakdown || {
      reasonConfidence: 0,
      dataQuality: 0,
      personalizationDepth: 0,
      total: 0,
    },
    auditId: audit.id,
  });

  const displayDecision: SafeToSendDecisionData | undefined = decision || 
    (prospectAudits?.audits?.[0] ? normalizeAudit(prospectAudits.audits[0]) : undefined);

  if (!displayDecision) {
    return null;
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-600";
    if (score >= 0.4) return "text-yellow-600";
    return "text-red-600";
  };

  const getProgressColor = (score: number) => {
    if (score >= 0.7) return "bg-green-500";
    if (score >= 0.4) return "bg-yellow-500";
    return "bg-red-500";
  };

  if (compact) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between p-2"
            data-testid="safe-to-send-toggle"
          >
            <div className="flex items-center gap-2">
              {displayDecision.canSend ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-sm font-medium">
                {displayDecision.canSend ? "Safe to Send" : "Blocked"}
              </span>
              <Badge variant="outline" className="text-xs">
                Score: {displayDecision.finalScore.toFixed(2)}
              </Badge>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-2">
          <SafeToSendDetails decision={displayDecision} />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Card
      className={
        displayDecision.canSend ? "border-green-200" : "border-red-200"
      }
      data-testid="safe-to-send-card"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {displayDecision.canSend ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <CardTitle className="text-lg">
              {displayDecision.canSend
                ? "Why this email will send"
                : "Why this email was blocked"}
            </CardTitle>
          </div>
          <Badge
            variant={displayDecision.canSend ? "default" : "destructive"}
            data-testid="decision-badge"
          >
            Score: {displayDecision.finalScore.toFixed(2)}
          </Badge>
        </div>
        <CardDescription>
          {displayDecision.canSend
            ? `Passed all checks with a score of ${displayDecision.finalScore.toFixed(2)} (minimum: 2.0)`
            : `${displayDecision.blockedReasons.length} blocking issue${displayDecision.blockedReasons.length > 1 ? "s" : ""} detected`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SafeToSendDetails decision={displayDecision} />
      </CardContent>
    </Card>
  );
}

function SafeToSendDetails({
  decision,
}: {
  decision: SafeToSendDecisionData;
}) {
  const getScoreColor = (score: number) => {
    if (score >= 0.7) return "text-green-600";
    if (score >= 0.4) return "text-yellow-600";
    return "text-red-600";
  };

  const getProgressColor = (score: number) => {
    if (score >= 0.7) return "bg-green-500";
    if (score >= 0.4) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4" data-testid="score-breakdown">
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Target className="h-3 w-3" />
            Reason Confidence
          </div>
          <div className="flex items-center gap-2">
            <Progress
              value={decision.scoreBreakdown.reasonConfidence * 100}
              className={`h-2 ${getProgressColor(decision.scoreBreakdown.reasonConfidence)}`}
            />
            <span
              className={`text-sm font-medium ${getScoreColor(decision.scoreBreakdown.reasonConfidence)}`}
            >
              {(decision.scoreBreakdown.reasonConfidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Database className="h-3 w-3" />
            Data Quality
          </div>
          <div className="flex items-center gap-2">
            <Progress
              value={decision.scoreBreakdown.dataQuality * 100}
              className={`h-2 ${getProgressColor(decision.scoreBreakdown.dataQuality)}`}
            />
            <span
              className={`text-sm font-medium ${getScoreColor(decision.scoreBreakdown.dataQuality)}`}
            >
              {(decision.scoreBreakdown.dataQuality * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Personalization
          </div>
          <div className="flex items-center gap-2">
            <Progress
              value={decision.scoreBreakdown.personalizationDepth * 100}
              className={`h-2 ${getProgressColor(decision.scoreBreakdown.personalizationDepth)}`}
            />
            <span
              className={`text-sm font-medium ${getScoreColor(decision.scoreBreakdown.personalizationDepth)}`}
            >
              {(decision.scoreBreakdown.personalizationDepth * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {decision.canSend ? (
        <div className="space-y-2" data-testid="send-reasons">
          <div className="flex items-center gap-1 text-sm font-medium text-green-700">
            <Shield className="h-4 w-4" />
            Passed Checks
          </div>
          <ul className="space-y-1">
            {decision.reasons.map((reason, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-2" data-testid="block-reasons">
          <div className="flex items-center gap-1 text-sm font-medium text-red-700">
            <AlertTriangle className="h-4 w-4" />
            Blocking Issues
          </div>
          <ul className="space-y-2">
            {decision.blockedReasons.map((reason, index) => (
              <li
                key={index}
                className={`p-2 rounded-md border ${getSeverityColor(reason.severity)}`}
                data-testid={`block-reason-${index}`}
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={getSeverityColor(reason.severity)}
                  >
                    {reason.severity.toUpperCase()}
                  </Badge>
                  <span className="font-mono text-xs">{reason.rule}</span>
                </div>
                <p className="text-sm mt-1">{reason.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.auditId && (
        <div className="text-xs text-muted-foreground border-t pt-2">
          Audit ID: {decision.auditId}
        </div>
      )}
    </div>
  );
}

interface SafeToSendAuditHistoryProps {
  prospectId?: string;
  sequenceId?: string;
}

export function SafeToSendAuditHistory({
  prospectId,
  sequenceId,
}: SafeToSendAuditHistoryProps) {
  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: prospectId
      ? ["/api/safe-to-send/prospect", prospectId, "audits"]
      : ["/api/safe-to-send/sequence", sequenceId, "audits"],
    enabled: !!(prospectId || sequenceId),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading audit history...</div>;
  }

  if (!data?.audits?.length) {
    return <div className="text-sm text-muted-foreground">No audit history available</div>;
  }

  return (
    <div className="space-y-4" data-testid="audit-history">
      {data.stats && (
        <div className="grid grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold">{data.stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.stats.sent}</div>
            <div className="text-xs text-muted-foreground">Sent</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{data.stats.blocked}</div>
            <div className="text-xs text-muted-foreground">Blocked</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{data.stats.averageScore.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Avg Score</div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {data.audits.map((audit: any) => (
          <SafeToSendDecision
            key={audit.id}
            decision={{
              canSend: audit.decision === "send",
              finalScore: parseFloat(audit.finalScore),
              reasons: audit.reasons || [],
              blockedReasons: audit.blockedReasons || [],
              scoreBreakdown: audit.scoreBreakdown || {
                reasonConfidence: 0,
                dataQuality: 0,
                personalizationDepth: 0,
                total: 0,
              },
              auditId: audit.id,
            }}
            compact
          />
        ))}
      </div>
    </div>
  );
}
