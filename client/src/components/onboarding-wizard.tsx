import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Mail, FileText, Users, Rocket, ArrowRight, ArrowLeft, X } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: any;
  action: string;
  actionPath?: string;
  completed: boolean;
}

export function OnboardingWizard() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

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

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/onboarding/complete', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to complete onboarding');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({
        title: "Onboarding Complete! 🎉",
        description: "You're all set up and ready to start your outreach campaigns!",
      });
    },
  });

  const skipOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/user/onboarding/skip', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to skip onboarding');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setIsOpen(false);
    },
  });

  const hasMailbox = (mailboxes?.length ?? 0) > 0;
  const hasSequence = (sequences?.length ?? 0) > 0;
  const hasProspects = (prospects?.total ?? 0) > 0;
  const hasCampaign = hasMailbox && hasSequence && hasProspects;

  const steps: OnboardingStep[] = [
    {
      id: 1,
      title: "Connect Your Email",
      description: "Add your first email mailbox to start sending outreach emails. You can connect Gmail, Outlook, or any SMTP account.",
      icon: Mail,
      action: "Connect Mailbox",
      actionPath: "/settings",
      completed: hasMailbox,
    },
    {
      id: 2,
      title: "Create a Sequence",
      description: "Build your first email sequence with multiple follow-ups. Use our AI to generate sequences or choose from templates.",
      icon: FileText,
      action: "Create Sequence",
      actionPath: "/sequences",
      completed: hasSequence,
    },
    {
      id: 3,
      title: "Add Prospects",
      description: "Import or search for prospects to contact. Use AI search, upload a CSV, or add prospects manually.",
      icon: Users,
      action: "Add Prospects",
      actionPath: "/",
      completed: hasProspects,
    },
    {
      id: 4,
      title: "Start Your Campaign",
      description: "You've completed all the setup steps! Your platform is ready. You can now enroll prospects in sequences and launch campaigns.",
      icon: Rocket,
      action: "Go to Sequences",
      actionPath: "/sequences",
      completed: hasCampaign,
    },
  ];

  useEffect(() => {
    if (user && !user.onboardingCompleted && mailboxes !== undefined && sequences !== undefined && prospects !== undefined) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, mailboxes, sequences, prospects]);

  const completedSteps = steps.filter(s => s.completed).length;
  const progress = (completedSteps / steps.length) * 100;
  const currentStepData = steps[currentStep];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleAction = () => {
    if (currentStepData.actionPath) {
      setIsOpen(false);
      setLocation(currentStepData.actionPath);
    }
  };

  const handleComplete = () => {
    completeOnboardingMutation.mutate();
    setIsOpen(false);
  };

  const handleSkip = () => {
    skipOnboardingMutation.mutate();
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  if (!user || user.onboardingCompleted) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl" data-testid="dialog-onboarding-wizard">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl" data-testid="text-onboarding-title">
                Welcome to Your SDR Platform! 🚀
              </DialogTitle>
              <DialogDescription data-testid="text-onboarding-description">
                Let's get you set up in 4 simple steps
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              data-testid="button-close-onboarding"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span data-testid="text-progress-label">Progress</span>
              <span data-testid="text-progress-value">{completedSteps} of {steps.length} completed</span>
            </div>
            <Progress value={progress} className="h-2" data-testid="progress-onboarding" />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(index)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-colors ${
                  currentStep === index
                    ? "bg-primary/10 border-2 border-primary"
                    : step.completed
                    ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                    : "bg-muted border border-border hover:bg-muted/80"
                }`}
                data-testid={`button-step-${index + 1}`}
              >
                {step.completed ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                ) : (
                  <Circle className="h-6 w-6 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-center">Step {step.id}</span>
              </button>
            ))}
          </div>

          <div className="bg-muted rounded-lg p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${
                currentStepData.completed 
                  ? "bg-green-100 dark:bg-green-900/30" 
                  : "bg-primary/10"
              }`}>
                <currentStepData.icon className={`h-8 w-8 ${
                  currentStepData.completed 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-primary"
                }`} />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-semibold" data-testid={`text-step-title-${currentStep + 1}`}>
                    {currentStepData.title}
                  </h3>
                  {currentStepData.completed && (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                </div>
                <p className="text-muted-foreground" data-testid={`text-step-description-${currentStep + 1}`}>
                  {currentStepData.description}
                </p>
              </div>
            </div>

            {currentStepData.completed ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Step completed! You can move to the next step or update this later.
                </p>
              </div>
            ) : (
              <Button
                onClick={handleAction}
                className="w-full"
                size="lg"
                data-testid={`button-action-step-${currentStep + 1}`}
              >
                {currentStepData.action}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={skipOnboardingMutation.isPending}
              data-testid="button-skip-onboarding"
            >
              Skip Setup
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                data-testid="button-previous-step"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              {currentStep < steps.length - 1 ? (
                <Button
                  onClick={handleNext}
                  data-testid="button-next-step"
                >
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleComplete}
                  disabled={completedSteps < steps.length || completeOnboardingMutation.isPending}
                  data-testid="button-complete-onboarding"
                >
                  Complete Setup
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
