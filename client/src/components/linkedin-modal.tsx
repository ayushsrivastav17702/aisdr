import { useState } from "react";
import { X, Sparkles, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

interface LinkedInModalProps {
  open: boolean;
  onClose: () => void;
  prospectId: string;
  prospectName: string;
  onPersonalizationComplete?: (result: any) => void;
}

export function LinkedInModal({
  open,
  onClose,
  prospectId,
  prospectName,
  onPersonalizationComplete,
}: LinkedInModalProps) {
  const [step, setStep] = useState(1);
  const [linkedInData, setLinkedInData] = useState({
    profileText: "",
    headline: "",
    recentPosts: "",
    recentComments: "",
    skills: "",
  });
  const [result, setResult] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  if (!open) return null;

  const handleGenerate = async () => {
    setProcessing(true);
    setStep(2);

    try {
      const response = await apiRequest("/api/personalization/manual-linkedin", {
        method: "POST",
        body: JSON.stringify({
          prospectId,
          linkedInData: {
            ...linkedInData,
            recentPosts: linkedInData.recentPosts ? linkedInData.recentPosts.split("\n") : [],
            recentComments: linkedInData.recentComments ? linkedInData.recentComments.split("\n") : [],
            skills: linkedInData.skills ? linkedInData.skills.split(",").map(s => s.trim()) : [],
          },
        }),
      });

      setResult(response);
      setStep(3);
      onPersonalizationComplete?.(response);
    } catch (error) {
      console.error("Personalization error:", error);
      alert("Failed to generate personalization");
      setStep(1);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-background border-b p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">AI Personalization with LinkedIn Data</h2>
            <p className="text-muted-foreground mt-1">Prospect: {prospectName}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-modal">
            <X className="w-6 h-6" />
          </Button>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              <Card className="border-primary/50 bg-primary/5">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <CardTitle className="text-base">How it works</CardTitle>
                      <CardDescription className="mt-1">
                        Paste LinkedIn data. OpenAI analyzes it to generate highly personalized emails (85-95% score).
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <div>
                <label className="block text-sm font-medium mb-2">Profile/About Section</label>
                <Textarea
                  value={linkedInData.profileText}
                  onChange={(e) => setLinkedInData({ ...linkedInData, profileText: e.target.value })}
                  placeholder="Paste their LinkedIn About section..."
                  rows={4}
                  className="w-full"
                  data-testid="input-profile-text"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Headline</label>
                <Textarea
                  value={linkedInData.headline}
                  onChange={(e) => setLinkedInData({ ...linkedInData, headline: e.target.value })}
                  placeholder="Their LinkedIn headline..."
                  rows={2}
                  className="w-full"
                  data-testid="input-headline"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Recent Posts (one per line)</label>
                <Textarea
                  value={linkedInData.recentPosts}
                  onChange={(e) => setLinkedInData({ ...linkedInData, recentPosts: e.target.value })}
                  placeholder="Paste their recent posts, one per line..."
                  rows={4}
                  className="w-full"
                  data-testid="input-recent-posts"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Recent Comments (one per line)</label>
                <Textarea
                  value={linkedInData.recentComments}
                  onChange={(e) => setLinkedInData({ ...linkedInData, recentComments: e.target.value })}
                  placeholder="Paste their recent comments, one per line..."
                  rows={4}
                  className="w-full"
                  data-testid="input-recent-comments"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Skills (comma-separated)</label>
                <Textarea
                  value={linkedInData.skills}
                  onChange={(e) => setLinkedInData({ ...linkedInData, skills: e.target.value })}
                  placeholder="Sales, Leadership, B2B, etc."
                  rows={2}
                  className="w-full"
                  data-testid="input-skills"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleGenerate}
                  disabled={!linkedInData.profileText.trim()}
                  className="flex items-center gap-2"
                  data-testid="button-generate"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Personalized Email
                </Button>
                <Button variant="outline" onClick={onClose} data-testid="button-cancel-modal">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center py-16">
              <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
              <h3 className="text-xl font-semibold mb-2">Analyzing LinkedIn Data...</h3>
              <p className="text-muted-foreground">OpenAI is generating your personalized email</p>
            </div>
          )}

          {step === 3 && result && (
            <div className="space-y-6">
              <Card className="border-green-500/50 bg-green-500/5">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <div>
                      <CardTitle>Personalization Complete!</CardTitle>
                      <CardDescription>
                        Personalization Score:{" "}
                        <Badge variant="default" className="ml-2">
                          {result.personalizationScore}%
                        </Badge>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <div>
                <h3 className="text-lg font-semibold mb-3">LinkedIn Analysis</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Professional Focus</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      {result.linkedInAnalysis?.professionalFocus?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Pain Points</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      {result.linkedInAnalysis?.painPoints?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Recent Interests</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      {result.linkedInAnalysis?.recentInterests?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Generated Email</h3>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Subject: {result.email?.subject}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{result.email?.body}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-3">
                <Button onClick={onClose} data-testid="button-done">
                  Done
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setResult(null);
                  }}
                  data-testid="button-try-again"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
