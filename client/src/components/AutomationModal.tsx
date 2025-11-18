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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Sparkles, Users, Database } from "lucide-react";
import { ProspectSelector } from "./ProspectSelector";

const automationSchema = z.object({
  prospectSource: z.enum(["apollo", "existing"]),
  prospectCount: z.coerce.number().int().min(1).max(500),
  selectedProspectIds: z.array(z.string()).optional(),
  aiPersonalizationEnabled: z.boolean(),
  jobTitle: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  scheduledFor: z.string().optional(),
  timezone: z.string().default("UTC"),
  skipContacted: z.boolean().default(true),
  skipUnsubscribed: z.boolean().default(true),
  skipDuplicates: z.boolean().default(true),
  dailyLimit: z.coerce.number().int().min(1).max(1000).default(500),
  delayBetweenEmails: z.coerce.number().int().min(5).max(300).default(30),
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
      prospectSource: "apollo",
      prospectCount: 50,
      selectedProspectIds: [],
      aiPersonalizationEnabled: true,
      jobTitle: "",
      company: "",
      location: "",
      timezone: "UTC",
      skipContacted: true,
      skipUnsubscribed: true,
      skipDuplicates: true,
      dailyLimit: 500,
      delayBetweenEmails: 30,
    },
  });

  const prospectSource = form.watch("prospectSource");

  const startAutomationMutation = useMutation({
    mutationFn: async (data: AutomationFormData) => {
      // Validate that user has selected prospects when using existing source
      if (data.prospectSource === "existing" && (!data.selectedProspectIds || data.selectedProspectIds.length === 0)) {
        throw new Error("Please select at least one prospect to enroll");
      }

      const response = await apiRequest(
        "POST",
        "/api/automation/start",
        {
          sequenceId,
          prospectSource: data.prospectSource,
          prospectCount: data.prospectCount,
          selectedProspectIds: data.selectedProspectIds,
          aiPersonalizationEnabled: data.aiPersonalizationEnabled,
          scheduledFor: data.scheduledFor,
          timezone: data.timezone,
          exclusionRules: {
            skipContacted: data.skipContacted,
            skipUnsubscribed: data.skipUnsubscribed,
            skipDuplicates: data.skipDuplicates,
          },
          rateLimitConfig: {
            dailyLimit: data.dailyLimit,
            delayBetweenEmails: data.delayBetweenEmails * 1000, // Convert to ms
            currentDailyCount: 0,
          },
          apolloFilters: data.prospectSource === "apollo" ? {
            person_titles: data.jobTitle ? [data.jobTitle] : [],
            q_organization_name: data.company || undefined,
            person_locations: data.location ? [data.location] : [],
            q_keywords: [data.jobTitle, data.company, data.location]
              .filter(Boolean)
              .join(" "),
          } : undefined,
        }
      );
      return response.json();
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
            {/* Prospect Source Selection */}
            <FormField
              control={form.control}
              name="prospectSource"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Prospect Source</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex flex-col space-y-2"
                      data-testid="radio-prospect-source"
                    >
                      <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                        <RadioGroupItem value="apollo" id="apollo" />
                        <Label htmlFor="apollo" className="flex items-center gap-2 cursor-pointer flex-1">
                          <Users className="w-4 h-4 text-blue-500" />
                          <div>
                            <div className="font-medium">Fetch from Apollo.io</div>
                            <div className="text-sm text-muted-foreground">Import new prospects from Apollo database</div>
                          </div>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50">
                        <RadioGroupItem value="existing" id="existing" />
                        <Label htmlFor="existing" className="flex items-center gap-2 cursor-pointer flex-1">
                          <Database className="w-4 h-4 text-green-500" />
                          <div>
                            <div className="font-medium">Use existing prospects</div>
                            <div className="text-sm text-muted-foreground">Enroll prospects from your database</div>
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Prospect Selection - Show selector for existing, count for Apollo */}
            {prospectSource === "existing" ? (
              <FormField
                control={form.control}
                name="selectedProspectIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Prospects</FormLabel>
                    <FormControl>
                      <ProspectSelector
                        selectedIds={field.value || []}
                        onSelectionChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
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
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === '' ? 50 : parseInt(value, 10));
                        }}
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
            )}

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

            {/* Apollo Filters Section - Only show when Apollo is selected */}
            {prospectSource === "apollo" && (
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
            )}

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
