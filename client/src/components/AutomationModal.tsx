import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Sparkles, Users } from "lucide-react";

const automationSchema = z.object({
  prospectCount: z.coerce.number().int().min(1).max(500),
  aiPersonalizationEnabled: z.boolean(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
});

type AutomationFormData = z.infer<typeof automationSchema>;

interface AutomationModalProps {
  sequenceId: string;
  sequenceName: string;
  open: boolean;
  onClose: () => void;
}

export function AutomationModal({
  sequenceId,
  sequenceName,
  open,
  onClose,
}: AutomationModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<AutomationFormData>({
    resolver: zodResolver(automationSchema),
    defaultValues: {
      prospectCount: 50,
      aiPersonalizationEnabled: true,
      jobTitle: "",
      company: "",
      location: "",
    },
  });

  const startAutomationMutation = useMutation({
    mutationFn: async (data: AutomationFormData) => {
      const response = await apiRequest(
        "/api/automation/start",
        "POST",
        {
          sequenceId,
          prospectCount: data.prospectCount,
          aiPersonalizationEnabled: data.aiPersonalizationEnabled,
          apolloFilters: {
            person_titles: data.jobTitle ? [data.jobTitle] : [],
            q_organization_name: data.company || undefined,
            person_locations: data.location ? [data.location] : [],
            q_keywords: [data.jobTitle, data.company, data.location]
              .filter(Boolean)
              .join(" "),
          },
        }
      );
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Automation Started",
        description: `Processing ${data.automationRun.prospectCount} prospects in background. Check the Automation Dashboard for progress.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/list"] });
      onClose();
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Automation Failed",
        description: error.message || "Failed to start automation",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AutomationFormData) => {
    startAutomationMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" data-testid="modal-automation">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            🤖 Run Sequence Automation
          </DialogTitle>
          <DialogDescription>
            Automatically import prospects from Apollo.io and enroll them in "
            {sequenceName}"
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Prospect Count */}
            <FormField
              control={form.control}
              name="prospectCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Prospects (Max 500)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      {...field}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10))
                      }
                      data-testid="input-prospect-count"
                    />
                  </FormControl>
                  <FormDescription>
                    How many prospects to import and enroll
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* AI Personalization */}
            <FormField
              control={form.control}
              name="aiPersonalizationEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-ai-personalization"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      Enable AI Personalization
                    </FormLabel>
                    <FormDescription>
                      Generate personalized emails for each prospect using AI
                      and LinkedIn data
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {/* Apollo Filters Section */}
            <div className="space-y-4 border-t pt-6">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Apollo.io Filters</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Define search criteria to find prospects in Apollo.io
              </p>

              <FormField
                control={form.control}
                name="jobTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., CEO, Founder, VP of Sales"
                        {...field}
                        data-testid="input-job-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Nike, Increff"
                        {...field}
                        data-testid="input-company"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., San Francisco, New York"
                        {...field}
                        data-testid="input-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={startAutomationMutation.isPending}
                data-testid="button-start-automation"
              >
                {startAutomationMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Automation
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
