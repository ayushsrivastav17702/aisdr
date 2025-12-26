import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Mail,
  Users,
  Settings,
  Sparkles
} from "lucide-react";

interface CampaignFormData {
  name: string;
  type: string;
  goal: string;
  dailySendLimit: number;
  subject: string;
  body: string;
}

const steps = [
  { id: 1, title: "Campaign Details", icon: Settings },
  { id: 2, title: "Email Content", icon: Mail },
  { id: 3, title: "Review & Launch", icon: Check },
];

export default function CreateCampaign() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const { toast } = useToast();

  const [formData, setFormData] = useState<CampaignFormData>({
    name: "",
    type: "cold_outreach",
    goal: "meetings",
    dailySendLimit: 100,
    subject: "",
    body: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      return await apiRequest("POST", "/api/campaigns", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign created",
        description: "Your campaign has been created successfully.",
      });
      setLocation("/campaigns");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create campaign",
        variant: "destructive",
      });
    },
  });

  const handleNext = () => {
    if (currentStep === 1 && !formData.name) {
      toast({
        title: "Missing information",
        description: "Please enter a campaign name",
        variant: "destructive",
      });
      return;
    }
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      setLocation("/campaigns");
    }
  };

  const handleSubmit = () => {
    createMutation.mutate(formData);
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <Button variant="ghost" onClick={handleBack} className="mb-4" data-testid="btn-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold" data-testid="page-title">Create New Campaign</h1>
          <p className="text-muted-foreground">Set up your email campaign in a few simple steps</p>
        </div>

        <div className="flex items-center justify-between mb-8">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  currentStep >= step.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
                data-testid={`step-indicator-${step.id}`}
              >
                <step.icon className="w-5 h-5" />
              </div>
              <div className="ml-3">
                <p className={`text-sm font-medium ${currentStep >= step.id ? "" : "text-muted-foreground"}`}>
                  Step {step.id}
                </p>
                <p className={`text-xs ${currentStep >= step.id ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                  {step.title}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-24 h-0.5 mx-4 ${currentStep > step.id ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Q1 Outreach Campaign"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-campaign-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="type">Campaign Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger data-testid="select-campaign-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                        <SelectItem value="nurture">Nurture Sequence</SelectItem>
                        <SelectItem value="follow_up">Follow-up</SelectItem>
                        <SelectItem value="re_engagement">Re-engagement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goal">Campaign Goal</Label>
                    <Select
                      value={formData.goal}
                      onValueChange={(value) => setFormData({ ...formData, goal: value })}
                    >
                      <SelectTrigger data-testid="select-campaign-goal">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meetings">Book Meetings</SelectItem>
                        <SelectItem value="demos">Schedule Demos</SelectItem>
                        <SelectItem value="awareness">Brand Awareness</SelectItem>
                        <SelectItem value="feedback">Collect Feedback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dailyLimit">Daily Send Limit</Label>
                  <Input
                    id="dailyLimit"
                    type="number"
                    min="1"
                    max="500"
                    value={formData.dailySendLimit}
                    onChange={(e) => setFormData({ ...formData, dailySendLimit: parseInt(e.target.value) || 100 })}
                    data-testid="input-daily-limit"
                  />
                  <p className="text-xs text-muted-foreground">Maximum emails to send per day</p>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="subject">Email Subject</Label>
                  <Input
                    id="subject"
                    placeholder="e.g., Quick question about {{companyName}}"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    data-testid="input-email-subject"
                  />
                  <p className="text-xs text-muted-foreground">Use {"{{firstName}}"}, {"{{companyName}}"} for personalization</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="body">Email Body</Label>
                  <Textarea
                    id="body"
                    placeholder="Hi {{firstName}},&#10;&#10;I noticed that {{companyName}} is..."
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    rows={10}
                    data-testid="input-email-body"
                  />
                </div>

                <Button variant="outline" className="w-full" data-testid="btn-ai-generate">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate with AI
                </Button>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Review Campaign Details</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Campaign Name</p>
                    <p className="font-medium" data-testid="review-name">{formData.name || "-"}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-medium" data-testid="review-type">{formData.type}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Goal</p>
                    <p className="font-medium" data-testid="review-goal">{formData.goal}</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Daily Limit</p>
                    <p className="font-medium" data-testid="review-limit">{formData.dailySendLimit} emails/day</p>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Email Subject</p>
                  <p className="font-medium" data-testid="review-subject">{formData.subject || "-"}</p>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">Email Preview</p>
                  <p className="whitespace-pre-wrap text-sm" data-testid="review-body">{formData.body || "-"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={handleBack} data-testid="btn-previous">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {currentStep === 1 ? "Cancel" : "Previous"}
          </Button>

          {currentStep < 3 ? (
            <Button onClick={handleNext} data-testid="btn-next">
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="btn-launch">
              {createMutation.isPending ? "Creating..." : "Launch Campaign"}
              <Check className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
