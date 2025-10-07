import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Brain, Globe, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface PersonalizationWizardProps {
  open: boolean;
  onClose: () => void;
  prospectId: string;
  prospectName: string;
}

interface PersonalizationAnalysis {
  personalizationScore: number;
  keyInsights: string[];
  recommendedApproach: string;
  personalizationFactors: {
    roleRelevance: number;
    companyFit: number;
    timingScore: number;
    painPointAlignment: number;
  };
  companyInsights?: {
    industry: string;
    size: string;
    recentNews: string[];
    techStack: string[];
  };
  roleInsights?: {
    responsibilities: string[];
    challenges: string[];
    priorities: string[];
  };
}

export function PersonalizationWizard({ 
  open, 
  onClose, 
  prospectId,
  prospectName 
}: PersonalizationWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<PersonalizationAnalysis | null>(null);
  const [includeWebScraping, setIncludeWebScraping] = useState(false);
  const { toast } = useToast();

  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const result = await apiRequest(
        'POST',
        '/api/personalization/analyze',
        { prospectId, includeWebScraping }
      ) as unknown as PersonalizationAnalysis;
      setAnalysis(result);
      setStep(3);
    } catch (error) {
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Failed to analyze prospect',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
    toast({
      title: 'Personalization Complete',
      description: 'Deep AI analysis saved successfully',
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-personalization-wizard">
        <DialogHeader>
          <DialogTitle>AI Personalization Wizard</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Deep analysis for {prospectName}
          </p>
        </DialogHeader>

        <Progress value={progress} className="mb-6" />

        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Analysis Options
              </h3>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Standard AI Analysis</CardTitle>
                  <CardDescription>
                    Analyzes prospect data using OpenAI GPT-4o for insights
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Role and responsibility analysis
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Company fit evaluation
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Personalization recommendations
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all ${includeWebScraping ? 'border-blue-500 ring-2 ring-blue-200' : ''}`}
                onClick={() => setIncludeWebScraping(!includeWebScraping)}
                data-testid="card-web-scraping-option"
              >
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Enhanced with Web Scraping
                    <Badge variant="secondary">Optional</Badge>
                  </CardTitle>
                  <CardDescription>
                    Scrape LinkedIn profile for additional insights
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      Real-time profile data
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                      Recent activity and posts
                    </li>
                    <li className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-500" />
                      Respects LinkedIn ToS (rate limited)
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button onClick={() => setStep(2)} data-testid="button-next">
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Confirm Analysis</h3>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm">
                  <strong>Prospect:</strong> {prospectName}
                </p>
                <p className="text-sm">
                  <strong>Analysis Type:</strong> {includeWebScraping ? 'Enhanced (with web scraping)' : 'Standard'}
                </p>
                <p className="text-sm text-muted-foreground">
                  This will use OpenAI credits to analyze the prospect
                </p>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={loading} data-testid="button-back">
                Back
              </Button>
              <Button onClick={runAnalysis} disabled={loading} data-testid="button-run-analysis">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Analyzing...' : 'Run Analysis'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && analysis && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Analysis Results
                </h3>
                <Badge 
                  variant={analysis.personalizationScore >= 80 ? 'default' : 'secondary'}
                  data-testid="badge-personalization-score"
                >
                  Score: {analysis.personalizationScore}/100
                </Badge>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Personalization Factors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Role Relevance</span>
                      <span className="font-medium">{analysis.personalizationFactors.roleRelevance}%</span>
                    </div>
                    <Progress value={analysis.personalizationFactors.roleRelevance} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Company Fit</span>
                      <span className="font-medium">{analysis.personalizationFactors.companyFit}%</span>
                    </div>
                    <Progress value={analysis.personalizationFactors.companyFit} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Timing Score</span>
                      <span className="font-medium">{analysis.personalizationFactors.timingScore}%</span>
                    </div>
                    <Progress value={analysis.personalizationFactors.timingScore} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Pain Point Alignment</span>
                      <span className="font-medium">{analysis.personalizationFactors.painPointAlignment}%</span>
                    </div>
                    <Progress value={analysis.personalizationFactors.painPointAlignment} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Key Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.keyInsights.map((insight, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommended Approach</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{analysis.recommendedApproach}</p>
                </CardContent>
              </Card>

              {analysis.roleInsights && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Role Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {analysis.roleInsights.responsibilities.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Responsibilities</h4>
                        <ul className="space-y-1">
                          {analysis.roleInsights.responsibilities.map((r, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground">• {r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {analysis.roleInsights.challenges.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Challenges</h4>
                        <ul className="space-y-1">
                          {analysis.roleInsights.challenges.map((c, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground">• {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {analysis.companyInsights && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Company Insights</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-semibold">Industry</p>
                        <p className="text-sm text-muted-foreground">{analysis.companyInsights.industry}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Size</p>
                        <p className="text-sm text-muted-foreground">{analysis.companyInsights.size}</p>
                      </div>
                    </div>
                    {analysis.companyInsights.techStack.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Tech Stack</h4>
                        <div className="flex flex-wrap gap-2">
                          {analysis.companyInsights.techStack.map((tech, idx) => (
                            <Badge key={idx} variant="outline">{tech}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} data-testid="button-close">
                Close
              </Button>
              <Button onClick={handleComplete} data-testid="button-complete">
                Complete
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
