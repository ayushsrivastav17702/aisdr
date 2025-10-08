import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Search, FileText, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ContentLibraryItem {
  id: string;
  title: string;
  type: string;
  description?: string;
  content: string;
  industry?: string;
  useCase?: string;
}

interface AITemplateGeneratorProps {
  open: boolean;
  onClose: () => void;
}

export function AITemplateGenerator({ open, onClose }: AITemplateGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [callToAction, setCallToAction] = useState("");
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [generatedTemplate, setGeneratedTemplate] = useState<any>(null);
  const [templateTitle, setTemplateTitle] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contentItems = [], isLoading } = useQuery<ContentLibraryItem[]>({
    queryKey: ["/api/content-library"],
    enabled: open,
  });

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/content-library/ai-generate-template", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedTemplate(data);
      toast({
        title: "Template Generated",
        description: "Your AI-generated email template is ready for review",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: error.message,
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/content-library", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
      toast({
        title: "Template Saved",
        description: "Your email template has been saved to the content library",
      });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message,
      });
    },
  });

  const filteredContent = contentItems.filter(item =>
    searchQuery === "" || 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        variant: "destructive",
        title: "Prompt Required",
        description: "Please describe what kind of email you want to generate",
      });
      return;
    }

    if (selectedContentIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Content Required",
        description: "Please select at least one content item to use",
      });
      return;
    }

    generateMutation.mutate({
      prompt,
      contentItemIds: selectedContentIds,
      settings: {
        tone,
        length,
        callToAction: callToAction || "schedule a call",
      },
    });
  };

  const handleSaveTemplate = () => {
    if (!templateTitle.trim()) {
      toast({
        variant: "destructive",
        title: "Title Required",
        description: "Please provide a title for the template",
      });
      return;
    }

    saveMutation.mutate({
      title: templateTitle,
      type: "email_template",
      description: `AI-generated template: ${prompt.substring(0, 100)}...`,
      content: generatedTemplate.content,
      variables: generatedTemplate.variables,
      tags: ["ai-generated", tone, length],
    });
  };

  const handleClose = () => {
    setPrompt("");
    setTone("professional");
    setLength("medium");
    setCallToAction("");
    setSelectedContentIds([]);
    setSearchQuery("");
    setGeneratedTemplate(null);
    setTemplateTitle("");
    onClose();
  };

  const toggleContentSelection = (id: string) => {
    setSelectedContentIds(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const getContentIcon = (type: string) => {
    return type.toLowerCase().includes('case') ? '📊' : 
           type.toLowerCase().includes('doc') ? '📁' : 
           '📄';
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            AI Email Template Generator
          </DialogTitle>
        </DialogHeader>

        {!generatedTemplate ? (
          <div className="space-y-6">
            {/* AI Generation Prompt */}
            <div className="space-y-2">
              <Label htmlFor="prompt">AI Generation Prompt</Label>
              <p className="text-sm text-muted-foreground">
                Describe what kind of email you want to generate. AI will use only your content library data.
              </p>
              <Textarea
                id="prompt"
                placeholder="Example: Create a follow-up email highlighting our key benefits for healthcare companies, including relevant case studies and a clear call-to-action for a demo."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="resize-none"
                data-testid="input-ai-prompt"
              />
            </div>

            {/* Template Settings */}
            <div className="space-y-4">
              <h3 className="font-semibold">Template Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tone">Email Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger id="tone" data-testid="select-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="length">Email Length</Label>
                  <Select value={length} onValueChange={setLength}>
                    <SelectTrigger id="length" data-testid="select-length">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (50-100 words)</SelectItem>
                      <SelectItem value="medium">Medium (100-200 words)</SelectItem>
                      <SelectItem value="long">Long (200-300 words)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cta">Call-to-Action</Label>
                  <Input
                    id="cta"
                    placeholder="Book a demo, Download whitepaper, etc."
                    value={callToAction}
                    onChange={(e) => setCallToAction(e.target.value)}
                    data-testid="input-cta"
                  />
                </div>
              </div>
            </div>

            {/* Content Library Selection */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Your Content Library</h3>
                <p className="text-sm text-muted-foreground">
                  Select content items to include in template generation. AI will only use this data.
                </p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search content items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-content"
                />
              </div>

              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Loading content library...
                  </div>
                ) : filteredContent.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No content items found
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredContent.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 hover:bg-accent cursor-pointer flex items-start gap-3"
                        onClick={() => toggleContentSelection(item.id)}
                        data-testid={`content-item-${item.id}`}
                      >
                        <Checkbox
                          checked={selectedContentIds.includes(item.id)}
                          onCheckedChange={() => toggleContentSelection(item.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <span className="text-lg">{getContentIcon(item.type)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{item.title}</div>
                              {item.description && (
                                <div className="text-sm text-muted-foreground line-clamp-2">
                                  {item.description}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground mt-1">
                                {item.type}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedContentIds.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {selectedContentIds.length} content item{selectedContentIds.length > 1 ? 's' : ''} selected
                </div>
              )}
            </div>

            {/* Generate Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                data-testid="button-generate"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Template
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Generated Template Review */
          <div className="space-y-6">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-semibold">Template Generated Successfully!</span>
              </div>
              <p className="text-sm text-green-600 dark:text-green-500">
                {generatedTemplate.reasoning}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-title">Template Title *</Label>
              <Input
                id="template-title"
                placeholder="e.g., Healthcare Follow-up Template"
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                data-testid="input-template-title"
              />
            </div>

            <div className="space-y-2">
              <Label>Subject Line</Label>
              <div className="p-3 bg-muted rounded-md font-medium" data-testid="generated-subject">
                {generatedTemplate.subject}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email Content</Label>
              <div className="p-4 bg-muted rounded-md whitespace-pre-wrap" data-testid="generated-content">
                {generatedTemplate.content}
              </div>
            </div>

            {generatedTemplate.variables?.length > 0 && (
              <div className="space-y-2">
                <Label>Template Variables</Label>
                <div className="flex flex-wrap gap-2">
                  {generatedTemplate.variables.map((variable: string, index: number) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-sm"
                    >
                      {`{{${variable}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {generatedTemplate.contentItemsUsed?.length > 0 && (
              <div className="space-y-2">
                <Label>Content Items Used</Label>
                <div className="text-sm text-muted-foreground">
                  {generatedTemplate.contentItemsUsed.map((item: any, index: number) => (
                    <div key={index} className="flex items-center gap-2">
                      <FileText className="w-3 h-3" />
                      {item.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setGeneratedTemplate(null)}
                data-testid="button-regenerate"
              >
                Regenerate
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={saveMutation.isPending}
                data-testid="button-save-template"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save to Library"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
