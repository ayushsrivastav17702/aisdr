import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { queryClient } from '@/lib/queryClient';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Eye,
  Users,
  Shield,
  Zap,
  Mail,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Target
} from 'lucide-react';

interface PreviewEmail {
  prospectId: string;
  prospectName: string;
  companyName: string;
  subject: string;
  body: string;
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  riskLevel: 'low' | 'medium' | 'high';
  hasHallucinationFlags: boolean;
  claimViolations: Array<{ type: string; matchedText: string; reason: string }>;
  dynamicFields: Array<{ field: string; value: string; start: number; end: number }>;
  warnings: string[];
}

interface BulkPreviewResponse {
  sequenceId: string;
  sequenceName: string;
  totalProspects: number;
  previewCount: number;
  previews: PreviewEmail[];
  aggregateStats: {
    highConfidenceCount: number;
    mediumConfidenceCount: number;
    lowConfidenceCount: number;
    hallucinationFlagCount: number;
    lowRiskCount: number;
    approvalRecommendation: 'safe_to_bulk_approve' | 'review_recommended' | 'manual_review_required';
  };
  templateLogic: {
    subject: string;
    bodyTemplate: string;
    dynamicTokens: string[];
  };
}

interface SequenceApprovalPreviewProps {
  sequenceId: string;
  sequenceName: string;
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
}

function ConfidenceBadge({ level, score }: { level: 'high' | 'medium' | 'low'; score: number }) {
  const config = {
    high: { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
    medium: { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertTriangle },
    low: { color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle }
  };
  
  const Icon = config[level].icon;
  
  return (
    <Badge variant="outline" className={`${config[level].color} flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {level.charAt(0).toUpperCase() + level.slice(1)} ({score}%)
    </Badge>
  );
}

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const config = {
    low: { color: 'bg-green-500', label: 'Low Risk' },
    medium: { color: 'bg-yellow-500', label: 'Medium Risk' },
    high: { color: 'bg-red-500', label: 'High Risk' }
  };
  
  return (
    <Badge className={`${config[level].color} text-white`}>
      {config[level].label}
    </Badge>
  );
}

function DiffHighlightedText({ body, dynamicFields }: { body: string; dynamicFields: PreviewEmail['dynamicFields'] }) {
  if (dynamicFields.length === 0) {
    return <div className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: body }} />;
  }
  
  let highlightedHtml = body;
  
  const sortedFields = [...dynamicFields].sort((a, b) => b.start - a.start);
  
  for (const field of sortedFields) {
    if (field.start >= 0 && field.end <= highlightedHtml.length) {
      const before = highlightedHtml.substring(0, field.start);
      const highlighted = highlightedHtml.substring(field.start, field.end);
      const after = highlightedHtml.substring(field.end);
      highlightedHtml = `${before}<span class="bg-blue-100 dark:bg-blue-900 px-1 rounded border-b-2 border-blue-400" title="${field.field}">${highlighted}</span>${after}`;
    }
  }
  
  return <div className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />;
}

function EmailPreviewCard({ email, isExpanded, onToggle }: { 
  email: PreviewEmail; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  return (
    <Card className={`mb-3 border-l-4 ${
      email.riskLevel === 'low' ? 'border-l-green-500' : 
      email.riskLevel === 'medium' ? 'border-l-yellow-500' : 'border-l-red-500'
    }`}>
      <CardHeader className="py-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="font-medium" data-testid={`preview-prospect-${email.prospectId}`}>
                {email.prospectName}
              </p>
              <p className="text-sm text-muted-foreground">{email.companyName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceBadge level={email.confidenceLevel} score={email.confidenceScore} />
            <RiskBadge level={email.riskLevel} />
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          <Separator className="mb-3" />
          
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Subject</p>
              <p className="font-medium">{email.subject}</p>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">
                Body 
                <span className="ml-2 text-blue-600">(Highlighted = Dynamic Fields)</span>
              </p>
              <div className="bg-muted/50 p-3 rounded-md">
                <DiffHighlightedText body={email.body} dynamicFields={email.dynamicFields} />
              </div>
            </div>
            
            {email.dynamicFields.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground">Dynamic fields:</span>
                {email.dynamicFields.map((field, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {field.field}: {field.value}
                  </Badge>
                ))}
              </div>
            )}
            
            {email.hasHallucinationFlags && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Potential Hallucination Detected</AlertTitle>
                <AlertDescription>
                  {email.claimViolations.map((v, i) => (
                    <p key={i} className="text-sm mt-1">
                      <strong>{v.type}:</strong> "{v.matchedText}" - {v.reason}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            
            {email.warnings.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {email.warnings.map((warning, i) => (
                  <Badge key={i} variant="outline" className="text-xs text-yellow-700 border-yellow-300">
                    {warning}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function SequenceApprovalPreview({ 
  sequenceId, 
  sequenceName,
  open, 
  onClose,
  onApprove
}: SequenceApprovalPreviewProps) {
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('overview');
  const { token } = useAuth();
  const { toast } = useToast();
  
  const { data: preview, isLoading, error } = useQuery<BulkPreviewResponse>({
    queryKey: [`/api/sequences/${sequenceId}/preview`],
    enabled: open && !!sequenceId,
  });
  
  // Get low-risk prospect IDs from preview data
  const lowRiskProspectIds = preview?.previews
    .filter(p => p.riskLevel === 'low')
    .map(p => p.prospectId) || [];
  
  const bulkApproveMutation = useMutation({
    mutationFn: async (approveType: 'all' | 'low_risk_only') => {
      const response = await fetch(`/api/sequences/${sequenceId}/bulk-approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          approveType,
          lowRiskProspectIds: approveType === 'low_risk_only' ? lowRiskProspectIds : undefined
        }),
      });
      if (!response.ok) throw new Error('Failed to bulk approve');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Emails Approved",
        description: `${data.approvedCount} emails approved for sending.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences'] });
      onApprove();
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve emails.",
        variant: "destructive",
      });
    },
  });
  
  const revertMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/sequences/${sequenceId}/revert-activation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to revert');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Activation Reverted",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences'] });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revert activation.",
        variant: "destructive",
      });
    },
  });
  
  const toggleEmail = (prospectId: string) => {
    setExpandedEmails(prev => {
      const next = new Set(prev);
      if (next.has(prospectId)) {
        next.delete(prospectId);
      } else {
        next.add(prospectId);
      }
      return next;
    });
  };
  
  const expandAll = () => {
    if (preview) {
      setExpandedEmails(new Set(preview.previews.map(p => p.prospectId)));
    }
  };
  
  const collapseAll = () => {
    setExpandedEmails(new Set());
  };
  
  const canBulkApprove = preview?.aggregateStats.approvalRecommendation === 'safe_to_bulk_approve';
  const lowRiskCount = preview?.aggregateStats.lowRiskCount || 0;
  const totalPreviewCount = preview?.previewCount || 0;
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview & Approve: {sequenceName}
          </DialogTitle>
          <DialogDescription>
            Review sample emails before sending to {preview?.totalProspects || 0} prospects
          </DialogDescription>
        </DialogHeader>
        
        <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Important Warning</AlertTitle>
          <AlertDescription>
            These emails will be sent to <strong>real prospects</strong>. Please review carefully before approving.
          </AlertDescription>
        </Alert>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Sparkles className="h-8 w-8 animate-pulse text-primary mb-4" />
            <p className="text-muted-foreground">Generating preview emails...</p>
            <Progress value={33} className="w-64 mt-4" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Failed to generate preview. Please try again.</AlertDescription>
          </Alert>
        ) : preview ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2" data-testid="tab-overview">
                <Target className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="samples" className="flex items-center gap-2" data-testid="tab-samples">
                <Mail className="h-4 w-4" />
                Sample Emails ({preview.previewCount})
              </TabsTrigger>
              <TabsTrigger value="template" className="flex items-center gap-2" data-testid="tab-template">
                <Zap className="h-4 w-4" />
                Template Logic
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="flex-1 overflow-auto">
              <div className="grid grid-cols-2 gap-4 p-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Prospects
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{preview.totalProspects}</p>
                    <p className="text-sm text-muted-foreground">
                      {preview.previewCount} samples reviewed
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Risk Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Low Risk</span>
                        <Badge className="bg-green-500">{preview.aggregateStats.lowRiskCount}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">High Confidence</span>
                        <Badge className="bg-green-500">{preview.aggregateStats.highConfidenceCount}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Hallucination Flags</span>
                        <Badge variant={preview.aggregateStats.hallucinationFlagCount > 0 ? "destructive" : "secondary"}>
                          {preview.aggregateStats.hallucinationFlagCount}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Confidence Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex h-4 rounded-full overflow-hidden">
                          <div 
                            className="bg-green-500" 
                            style={{ width: `${(preview.aggregateStats.highConfidenceCount / preview.previewCount) * 100}%` }}
                          />
                          <div 
                            className="bg-yellow-500" 
                            style={{ width: `${(preview.aggregateStats.mediumConfidenceCount / preview.previewCount) * 100}%` }}
                          />
                          <div 
                            className="bg-red-500" 
                            style={{ width: `${(preview.aggregateStats.lowConfidenceCount / preview.previewCount) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded bg-green-500" />
                          High ({preview.aggregateStats.highConfidenceCount})
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded bg-yellow-500" />
                          Medium ({preview.aggregateStats.mediumConfidenceCount})
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded bg-red-500" />
                          Low ({preview.aggregateStats.lowConfidenceCount})
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recommendation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {preview.aggregateStats.approvalRecommendation === 'safe_to_bulk_approve' ? (
                      <Alert className="bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertTitle className="text-green-800">Safe to Bulk Approve</AlertTitle>
                        <AlertDescription className="text-green-700">
                          All samples have high confidence and no hallucination flags. 
                          You can safely approve all emails.
                        </AlertDescription>
                      </Alert>
                    ) : preview.aggregateStats.approvalRecommendation === 'review_recommended' ? (
                      <Alert className="bg-yellow-50 border-yellow-200">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <AlertTitle className="text-yellow-800">Review Recommended</AlertTitle>
                        <AlertDescription className="text-yellow-700">
                          Some samples have medium confidence or warnings. 
                          Review the sample emails before approving.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertTitle>Manual Review Required</AlertTitle>
                        <AlertDescription>
                          Several samples have low confidence or hallucination flags. 
                          Please review each email carefully.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="samples" className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-2 border-b">
                <p className="text-sm text-muted-foreground">
                  Showing {preview.previewCount} of {preview.totalProspects} emails
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={expandAll} data-testid="button-expand-all">
                    Expand All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={collapseAll} data-testid="button-collapse-all">
                    Collapse All
                  </Button>
                </div>
              </div>
              
              <ScrollArea className="flex-1 p-4">
                {preview.previews.map((email) => (
                  <EmailPreviewCard
                    key={email.prospectId}
                    email={email}
                    isExpanded={expandedEmails.has(email.prospectId)}
                    onToggle={() => toggleEmail(email.prospectId)}
                  />
                ))}
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="template" className="flex-1 overflow-auto p-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Template Subject</CardTitle>
                </CardHeader>
                <CardContent>
                  <code className="bg-muted p-2 rounded block">
                    {preview.templateLogic.subject || 'No subject template'}
                  </code>
                </CardContent>
              </Card>
              
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-sm">Template Body</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-3 rounded text-sm whitespace-pre-wrap overflow-auto max-h-64">
                    {preview.templateLogic.bodyTemplate || 'No body template'}
                  </pre>
                </CardContent>
              </Card>
              
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-sm">Dynamic Tokens Used</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {preview.templateLogic.dynamicTokens.length > 0 ? (
                      preview.templateLogic.dynamicTokens.map((token, i) => (
                        <Badge key={i} variant="secondary" className="font-mono">
                          {`{{${token}}}`}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No dynamic tokens detected</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : null}
        
        <DialogFooter className="border-t pt-4 flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <Button
              variant="outline"
              onClick={() => revertMutation.mutate()}
              disabled={revertMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50"
              data-testid="button-revert-activation"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Revert Activation
            </Button>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel-preview">
                Cancel
              </Button>
              
              {canBulkApprove ? (
                <Button
                  onClick={() => bulkApproveMutation.mutate('all')}
                  disabled={bulkApproveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-approve-all"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve All ({preview?.totalProspects})
                </Button>
              ) : (
                <Button
                  onClick={() => bulkApproveMutation.mutate('low_risk_only')}
                  disabled={bulkApproveMutation.isPending || lowRiskCount === 0}
                  data-testid="button-approve-low-risk"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Approve Low-Risk Only ({lowRiskCount})
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
