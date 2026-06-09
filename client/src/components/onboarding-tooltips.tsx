import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  X,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Mail,
  Users,
  FileText,
  Sparkles,
  BarChart3,
  Inbox,
  BookOpen,
  Play,
  Lightbulb,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { queryClient } from "@/lib/queryClient";

interface TooltipStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  targetPath: string;
  action?: string;
  tips?: string[];
  isComplete?: boolean;
}

const onboardingSteps: TooltipStep[] = [
  {
    id: "profile",
    title: "1. Complete Your Profile",
    description: "Set your timezone and preferences for optimal email delivery timing.",
    icon: Users,
    targetPath: "/profile",
    action: "Go to Profile",
    tips: ["Timezone is critical for send timing", "Update your name and role"],
  },
  {
    id: "mailbox",
    title: "2. Connect Your Mailbox",
    description: "Add your email account to start sending outreach emails.",
    icon: Mail,
    targetPath: "/mailboxes",
    action: "Connect Mailbox",
    tips: ["Use Gmail or Outlook for easy setup", "Multiple mailboxes enable higher volume"],
  },
  {
    id: "prospects",
    title: "3. Find Prospects",
    description: "Use AI search or import prospects to build your pipeline.",
    icon: Users,
    targetPath: "/ai-search",
    action: "Search Prospects",
    tips: ["Use natural language for AI search", "Import CSV for bulk prospects"],
  },
  {
    id: "sequence",
    title: "4. Create a Sequence",
    description: "Build your email outreach campaign with multiple follow-ups.",
    icon: FileText,
    targetPath: "/sequences",
    action: "Create Sequence",
    tips: ["Keep sequences to 3-5 emails", "Use templates for faster setup"],
  },
  {
    id: "delay-rules",
    title: "5. Set Delay Rules",
    description: "Configure timing between emails in your sequence to maximize engagement.",
    icon: FileText,
    targetPath: "/sequences",
    action: "View Sequences",
    tips: ["2-3 days between follow-ups is typical", "Configure delays in sequence step settings"],
  },
  {
    id: "personalization",
    title: "6. Enable AI Personalization",
    description: "Toggle AI personalization in your sequence settings for higher response rates.",
    icon: Sparkles,
    targetPath: "/sequences",
    action: "View Sequences",
    tips: ["Enable in sequence settings", "AI uses prospect data for personalization"],
  },
  {
    id: "campaign",
    title: "7. Activate Your Campaign",
    description: "Start your outreach and monitor results.",
    icon: Play,
    targetPath: "/campaigns",
    action: "View Campaigns",
    tips: ["Check your send limits first", "Monitor bounce rates closely"],
  },
  {
    id: "inbox",
    title: "8. Manage Replies",
    description: "Handle responses and follow up with interested prospects.",
    icon: Inbox,
    targetPath: "/inbox",
    action: "Go to Inbox",
    tips: ["Respond quickly to interested prospects", "Use AI-suggested replies"],
  },
  {
    id: "analytics",
    title: "9. Track Performance",
    description: "Review your metrics and optimize your outreach.",
    icon: BarChart3,
    targetPath: "/analytics",
    action: "View Analytics",
    tips: ["20%+ open rate is good", "2-5% reply rate is typical for cold outreach"],
  },
];

export function OnboardingTooltips() {
  const [location, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);

  const { isAuthenticated } = useAuth();

  const { data: user } = useQuery<any>({
    queryKey: ['/api/user'],
    enabled: isAuthenticated,
  });

  const { data: mailboxes } = useQuery<any[]>({
    queryKey: ['/api/mailboxes'],
    enabled: isAuthenticated,
  });

  const { data: sequences } = useQuery<any[]>({
    queryKey: ['/api/sequences'],
    enabled: isAuthenticated,
  });

  const { data: prospects } = useQuery<any>({
    queryKey: ['/api/prospects'],
    enabled: isAuthenticated,
  });

  const hasProfile = user?.firstName && user?.lastName;
  const hasMailbox = (mailboxes?.length ?? 0) > 0;
  const hasProspects = (prospects?.total ?? 0) > 0;
  const hasSequence = (sequences?.length ?? 0) > 0;

  const stepsWithCompletion: TooltipStep[] = onboardingSteps.map((step) => {
    let isComplete = false;
    switch (step.id) {
      case "profile":
        isComplete = hasProfile;
        break;
      case "mailbox":
        isComplete = hasMailbox;
        break;
      case "prospects":
        isComplete = hasProspects;
        break;
      case "sequence":
        isComplete = hasSequence;
        break;
      case "delay-rules":
        isComplete = hasSequence;
        break;
      case "personalization":
        isComplete = hasSequence;
        break;
      case "campaign":
        isComplete = hasMailbox && hasSequence && hasProspects;
        break;
      case "inbox":
      case "analytics":
        isComplete = hasMailbox && hasSequence && hasProspects;
        break;
    }
    return { ...step, isComplete };
  });

  const completedCount = stepsWithCompletion.filter((s) => s.isComplete).length;
  const progress = (completedCount / stepsWithCompletion.length) * 100;
  const currentStep = stepsWithCompletion[currentStepIndex];
  const allComplete = completedCount === stepsWithCompletion.length;

  useEffect(() => {
    const stored = localStorage.getItem("onboarding_tooltips_dismissed");
    if (stored) {
      const dismissedTime = parseInt(stored, 10);
      if (Date.now() < dismissedTime) {
        setDismissedUntil(dismissedTime);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.onboardingCompleted) return;
    if (dismissedUntil && Date.now() < dismissedUntil) return;
    if (allComplete) return;

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [user, dismissedUntil, allComplete]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
  }, []);

  const handleDismissForSession = useCallback(() => {
    const dismissTime = Date.now() + 24 * 60 * 60 * 1000;
    localStorage.setItem("onboarding_tooltips_dismissed", dismissTime.toString());
    setDismissedUntil(dismissTime);
    setIsVisible(false);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStepIndex < stepsWithCompletion.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  }, [currentStepIndex, stepsWithCompletion.length]);

  const handlePrev = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  }, [currentStepIndex]);

  const handleGoToStep = useCallback(() => {
    if (currentStep?.targetPath) {
      setLocation(currentStep.targetPath);
      setIsVisible(false);
    }
  }, [currentStep, setLocation]);

  if (!isVisible || !currentStep) {
    return null;
  }

  return (
    <div className="fixed bottom-24 right-6 z-40" data-testid="onboarding-tooltips">
      <Card className="w-80 shadow-xl border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <currentStep.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Badge variant="secondary" className="text-xs mb-1">
                  Step {currentStepIndex + 1} of {stepsWithCompletion.length}
                </Badge>
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  {currentStep.title}
                  {currentStep.isComplete && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                </h4>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDismiss}
              data-testid="button-dismiss-tooltip"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground mb-3">
            {currentStep.description}
          </p>

          {currentStep.tips && currentStep.tips.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2 mb-3">
              <div className="flex items-center gap-1 mb-1">
                <Lightbulb className="w-3 h-3 text-yellow-600" />
                <span className="text-xs font-medium text-yellow-800 dark:text-yellow-200">Tip</span>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                {currentStep.tips[0]}
              </p>
            </div>
          )}

          <Progress value={progress} className="h-1.5 mb-3" />

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                disabled={currentStepIndex === 0}
                data-testid="button-prev-tooltip"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNext}
                disabled={currentStepIndex === stepsWithCompletion.length - 1}
                data-testid="button-next-tooltip"
              >
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismissForSession}
                className="text-xs"
                data-testid="button-dismiss-session"
              >
                Hide for now
              </Button>
              {currentStep.action && !currentStep.isComplete && (
                <Button
                  size="sm"
                  onClick={handleGoToStep}
                  className="text-xs"
                  data-testid="button-go-to-step"
                >
                  {currentStep.action}
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t">
            <Link href="/user-guide">
              <Button
                variant="link"
                size="sm"
                className="text-xs p-0 h-auto"
                data-testid="button-view-full-guide"
              >
                <BookOpen className="w-3 h-3 mr-1" />
                View Full User Guide
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
