import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Plus, ArrowLeft, FileText, Sparkles, Zap, Mail, Loader2
} from "lucide-react";
import { SEQUENCE_TEMPLATES } from "./templates";

export function CreateSequenceButton() {
  const [showMethodSelector, setShowMethodSelector] = useState(false);
  const [creationMethod, setCreationMethod] = useState<'scratch' | 'template' | 'ai' | 'auto-ai' | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/sequences", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence created successfully" });
      setShowMethodSelector(false);
      setCreationMethod(null);
      setName("");
      setDescription("");
      // Navigate to the newly created sequence builder
      if (data?.id) {
        setLocation(`/sequences/${data.id}`);
      }
    },
    onError: () => {
      toast({ title: "Failed to create sequence", variant: "destructive" });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async (data: { prompt: string; name: string; method: 'ai' | 'auto-ai' }) => {
      const res = await apiRequest("POST", "/api/sequences/generate-with-ai", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "AI-powered sequence created successfully" });
      setShowMethodSelector(false);
      setCreationMethod(null);
      setName("");
      setDescription("");
      setAiPrompt("");
      // Navigate to the newly created sequence builder
      if (data?.sequence?.id) {
        setLocation(`/sequences/${data.sequence.id}`);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to generate sequence",
        description: error?.message || "Please try again",
        variant: "destructive"
      });
    },
  });

  const handleMethodSelect = (method: 'scratch' | 'template' | 'ai' | 'auto-ai') => {
    setCreationMethod(method);
  };

  const handleBackToMethods = () => {
    setCreationMethod(null);
    setSelectedTemplate(null);
    setAiPrompt("");
  };

  return (
    <>
      <Button onClick={() => setShowMethodSelector(true)} data-testid="button-new-sequence">
        <Plus className="w-4 h-4 mr-2" />
        New Sequence
      </Button>

      <Dialog open={showMethodSelector} onOpenChange={(open) => {
        setShowMethodSelector(open);
        if (!open) {
          setCreationMethod(null);
          setName("");
          setDescription("");
        }
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Sequence</DialogTitle>
          </DialogHeader>

          {!creationMethod ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">How do you want to create your sequence?</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleMethodSelect('scratch')}
                  data-testid="method-scratch"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Create from Scratch</CardTitle>
                        <CardDescription>Create a sequence manually by yourself</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleMethodSelect('template')}
                  data-testid="method-template"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                        <Mail className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Choose from Template Library</CardTitle>
                        <CardDescription>Browse professional email sequence templates for instant use</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleMethodSelect('ai')}
                  data-testid="method-ai"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Generate with AI</CardTitle>
                        <CardDescription>Write a prompt and let AI create your email</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleMethodSelect('auto-ai')}
                  data-testid="method-auto-ai"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                        <Zap className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Auto Create with AI</CardTitle>
                        <CardDescription>Automatically generate best sequence using AI powered by ChatGPT</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </div>
            </div>
          ) : creationMethod === 'scratch' ? (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>

              <div className="space-y-4">
                <div>
                  <Label>Sequence Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="New Sequence"
                    data-testid="input-sequence-name"
                  />
                </div>
                <div>
                  <Label>Description (Optional)</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Created from scratch"
                    data-testid="input-sequence-description"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (name.trim()) {
                        createMutation.mutate({ name, description });
                      }
                    }}
                    disabled={!name.trim() || createMutation.isPending}
                    data-testid="button-create-sequence"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Sequence"}
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setShowMethodSelector(false);
                    setCreationMethod(null);
                    setName("");
                    setDescription("");
                  }} data-testid="button-cancel">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : creationMethod === 'template' ? (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>

              <div>
                <h3 className="text-lg font-semibold mb-4">Choose a Template</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {SEQUENCE_TEMPLATES.map((template) => {
                    const IconComponent = template.icon;
                    return (
                      <Card
                        key={template.id}
                        className={`cursor-pointer transition-colors ${
                          selectedTemplate === template.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-primary/50'
                        }`}
                        onClick={() => {
                          setSelectedTemplate(template.id);
                          setName(template.name);
                          setDescription(template.description);
                        }}
                        data-testid={`template-${template.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                              <IconComponent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              <CardDescription className="text-sm mt-1">{template.description}</CardDescription>
                              <div className="mt-2 flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{template.category}</Badge>
                                <span className="text-xs text-muted-foreground">{template.steps.length} steps</span>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {selectedTemplate && (
                <div className="space-y-4 pt-4 border-t">
                  <div>
                    <Label>Sequence Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Sequence name"
                      data-testid="input-template-name"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        if (!name.trim() || !selectedTemplate) return;

                        const template = SEQUENCE_TEMPLATES.find(t => t.id === selectedTemplate);
                        if (!template) return;

                        try {
                          // Create sequence
                          const res = await apiRequest("POST", "/api/sequences", {
                            name,
                            description: template.description,
                          });
                          const sequence = await res.json();

                          // Add template steps
                          for (const step of template.steps) {
                            await apiRequest("POST", `/api/sequences/${sequence.id}/steps`, step);
                          }

                          queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
                          toast({ title: "Sequence created from template successfully" });
                          setShowMethodSelector(false);
                          setCreationMethod(null);
                          setName("");
                          setDescription("");
                          setSelectedTemplate(null);
                          setLocation(`/sequences/${sequence.id}`);
                        } catch (error) {
                          toast({
                            title: "Failed to create sequence",
                            variant: "destructive"
                          });
                        }
                      }}
                      disabled={!name.trim() || !selectedTemplate}
                      data-testid="button-create-from-template"
                    >
                      Create from Template
                    </Button>
                    <Button variant="outline" onClick={handleBackToMethods}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : creationMethod === 'ai' ? (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Generate with AI</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Describe the email you want to create, and AI will generate it for you
                  </p>
                </div>

                <div>
                  <Label>Sequence Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Product Demo Outreach"
                    data-testid="input-ai-name"
                  />
                </div>

                <div>
                  <Label>Describe your email</Label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., Write a friendly outreach email to software engineers at mid-sized tech companies, introducing our new API product that helps with authentication. Keep it under 100 words and include a clear call-to-action to book a demo."
                    rows={6}
                    data-testid="input-ai-prompt"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Tip: Be specific about tone, target audience, and what action you want recipients to take
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (name.trim() && aiPrompt.trim()) {
                        aiGenerateMutation.mutate({
                          name,
                          prompt: aiPrompt,
                          method: 'ai'
                        });
                      }
                    }}
                    disabled={!name.trim() || !aiPrompt.trim() || aiGenerateMutation.isPending}
                    data-testid="button-generate-ai"
                  >
                    {aiGenerateMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Email
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleBackToMethods}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" onClick={handleBackToMethods} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Methods
              </Button>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Auto Create with AI</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    AI will automatically generate a complete multi-step outreach sequence for you
                  </p>
                </div>

                <div>
                  <Label>Sequence Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., SaaS Product Launch Campaign"
                    data-testid="input-auto-ai-name"
                  />
                </div>

                <div>
                  <Label>Describe your campaign</Label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g., Create a 4-step cold outreach sequence for CTOs at enterprise companies in the healthcare industry. We're launching a HIPAA-compliant data analytics platform. Tone should be professional yet approachable."
                    rows={6}
                    data-testid="input-auto-ai-prompt"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Tip: Include target audience, product/service, industry, desired tone, and any specific requirements
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">AI will generate:</p>
                      <ul className="text-blue-700 dark:text-blue-300 space-y-1">
                        <li>• Initial outreach email (sent immediately)</li>
                        <li>• Follow-up email (2-3 days later)</li>
                        <li>• Value-add email (4-5 days later)</li>
                        <li>• Break-up email (final touchpoint)</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (name.trim() && aiPrompt.trim()) {
                        aiGenerateMutation.mutate({
                          name,
                          prompt: aiPrompt,
                          method: 'auto-ai'
                        });
                      }
                    }}
                    disabled={!name.trim() || !aiPrompt.trim() || aiGenerateMutation.isPending}
                    data-testid="button-generate-auto-ai"
                  >
                    {aiGenerateMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Sequence...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Auto Create Sequence
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={handleBackToMethods}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
