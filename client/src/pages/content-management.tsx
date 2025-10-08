import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  FileText, 
  Upload, 
  X, 
  Trash2,
  Edit,
  Copy,
  Brain,
  ArrowLeft,
  Search,
  Filter,
  FileCheck,
  AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import type { ContentLibraryItem } from "@shared/schema";

export default function ContentManagement() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedTab, setSelectedTab] = useState<"manual" | "upload">("manual");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const { toast } = useToast();

  const { data: contentItems = [], isLoading } = useQuery<ContentLibraryItem[]>({
    queryKey: ["/api/content-library"],
  });

  const filteredItems = contentItems.filter(item => {
    const matchesSearch = searchQuery === "" || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || item.type === filterType;
    return matchesSearch && matchesType;
  });

  const contentTypes = Array.from(new Set(contentItems.map(item => item.type)));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar Navigation */}
      <aside className="w-60 bg-card border-r border-border flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">AISDR</h1>
              <p className="text-xs text-muted-foreground">AI Sales Platform</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link href="/">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
              data-testid="nav-dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </Button>
          </Link>
          
          <Link href="/sequences">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:bg-muted"
              data-testid="nav-sequences"
            >
              <FileText className="w-4 h-4" />
              <span>Sequences</span>
            </Button>
          </Link>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 bg-primary/10 text-primary hover:bg-primary/20"
            data-testid="nav-content"
          >
            <FileCheck className="w-4 h-4" />
            <span>Content Library</span>
          </Button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card">
          <div className="flex items-center justify-between p-6">
            <div>
              <h1 className="text-2xl font-bold" data-testid="page-title">Content Library</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage content items for AI-powered email personalization
              </p>
            </div>
            <Button onClick={() => {
              setShowAddDialog(true);
              setSelectedTab("manual");
            }} data-testid="button-add-content">
              <Plus className="w-4 h-4 mr-2" />
              Add Content
            </Button>
          </div>
        </header>

        {/* Search and Filter Bar */}
        <div className="p-6 border-b border-border bg-card/50">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search content items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-content"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px]" data-testid="select-filter-type">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {contentTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading content items...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No content items found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || filterType !== "all" 
                  ? "Try adjusting your search or filters"
                  : "Get started by adding your first content item"}
              </p>
              {!searchQuery && filterType === "all" && (
                <Button onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Content Item
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <ContentItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Content Dialog */}
      <AddContentDialog 
        open={showAddDialog} 
        onClose={() => {
          setShowAddDialog(false);
          setSelectedTab("manual");
        }}
        initialTab={selectedTab}
      />
    </div>
  );
}

function ContentItemCard({ item }: { item: ContentLibraryItem }) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/content-library/${item.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
      toast({ title: "Content item deleted successfully" });
      setShowDeleteConfirm(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to delete content item", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const tags = Array.isArray(item.tags) ? item.tags : [];

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg" data-testid={`text-content-title-${item.id}`}>
              {item.title}
            </CardTitle>
            <CardDescription className="mt-1">
              <Badge variant="outline" className="text-xs">{item.type}</Badge>
              {item.industry && (
                <Badge variant="secondary" className="ml-2 text-xs">{item.industry}</Badge>
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteConfirm(true)}
            data-testid={`button-delete-${item.id}`}
          >
            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
          {item.content}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.slice(0, 3).map((tag, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {String(tag)}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        )}
        {item.useCase && (
          <p className="text-xs text-muted-foreground">Use Case: {item.useCase}</p>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Content Item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{item.title}"? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddContentDialog({ 
  open, 
  onClose,
  initialTab = "manual" 
}: { 
  open: boolean; 
  onClose: () => void;
  initialTab?: "manual" | "upload";
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("Case Study");
  const [content, setContent] = useState("");
  const [industry, setIndustry] = useState("");
  const [useCase, setUseCase] = useState("");
  const [tags, setTags] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const resetForm = () => {
    setTitle("");
    setContentType("Case Study");
    setContent("");
    setIndustry("");
    setUseCase("");
    setTags("");
    setUploadedFile(null);
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/content-library", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-library"] });
      toast({ title: "Content item added successfully" });
      resetForm();
      onClose();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to add content item", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const handleFileUpload = async (file: File) => {
    if (!file.name.match(/\.(txt|md)$/i)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a TXT or MD file",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive"
      });
      return;
    }

    setUploadedFile(file);
    const text = await file.text();
    setContent(text);
    toast({ title: "File uploaded successfully" });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!content.trim()) {
      toast({ 
        title: "Content is required", 
        description: "Please paste your PDF content or enter text manually",
        variant: "destructive" 
      });
      return;
    }

    const tagsArray = tags.split(",").map(t => t.trim()).filter(t => t);
    
    createMutation.mutate({
      title: title.trim(),
      type: contentType,
      content: content.trim(),
      industry: industry.trim() || undefined,
      useCase: useCase.trim() || undefined,
      tags: tagsArray.length > 0 ? tagsArray : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        onClose();
        resetForm();
      }
    }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Content Item</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "manual" | "upload")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" data-testid="tab-manual-entry">Manual Entry</TabsTrigger>
            <TabsTrigger value="upload" data-testid="tab-upload-file">Upload File</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="Enter content title (required)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-title"
              />
              {!title && <p className="text-xs text-muted-foreground">Title is required</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contentType">Content Type</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger id="contentType" data-testid="select-content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Case Study">Case Study</SelectItem>
                  <SelectItem value="White Paper">White Paper</SelectItem>
                  <SelectItem value="Product Sheet">Product Sheet</SelectItem>
                  <SelectItem value="ROI Calculator">ROI Calculator</SelectItem>
                  <SelectItem value="Testimonial">Testimonial</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">
                Content <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="content"
                placeholder="Paste your PDF content here or enter the content that AI will use for email generation..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                data-testid="textarea-content"
              />
              {!content && (
                <p className="text-xs text-muted-foreground">
                  Content is required - please paste your PDF content or enter text manually
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <AlertCircle className="w-4 h-4" />
                <span>💡 Copy content from your PDF and paste it here</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="industry">Industry (Optional)</Label>
                <Input
                  id="industry"
                  placeholder="e.g., Technology, Healthcare"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  data-testid="input-industry"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="useCase">Use Case (Optional)</Label>
                <Input
                  id="useCase"
                  placeholder="e.g., Cold outreach, Follow-up"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  data-testid="input-use-case"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                placeholder="Enter tags separated by commas"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                data-testid="input-tags"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={createMutation.isPending}
                data-testid="button-add-content-submit"
              >
                {createMutation.isPending ? "Adding..." : "Add Content"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-4 mt-4">
            <div 
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                data-testid="input-file-upload"
              />
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm font-medium mb-1">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground">
                Supports: TXT and MD files - max 10MB (PDF conversion coming soon)
              </p>
              {uploadedFile && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-primary">
                  <FileCheck className="w-4 h-4" />
                  <span>{uploadedFile.name}</span>
                </div>
              )}
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">📋 Working with PDF files?</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <strong>Fastest:</strong> Open PDF → Select All (Ctrl+A) → Copy → Use "Manual Entry" above</li>
                <li>• <strong>Alternative:</strong> Save PDF as .txt file, then upload</li>
                <li>• <strong>Online:</strong> Use smallpdf.com/pdf-to-txt converter</li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="upload-title"
                placeholder="Enter content title (required)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-upload-title"
              />
              {!title && <p className="text-xs text-muted-foreground">Title is required</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-contentType">Content Type</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger id="upload-contentType" data-testid="select-upload-content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Case Study">Case Study</SelectItem>
                  <SelectItem value="White Paper">White Paper</SelectItem>
                  <SelectItem value="Product Sheet">Product Sheet</SelectItem>
                  <SelectItem value="ROI Calculator">ROI Calculator</SelectItem>
                  <SelectItem value="Testimonial">Testimonial</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-content">
                Content <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="upload-content"
                placeholder="Content will appear here after file upload..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                data-testid="textarea-upload-content"
              />
              {!content && (
                <p className="text-xs text-muted-foreground">
                  Content is required - please paste your PDF content or enter text manually
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="upload-industry">Industry (Optional)</Label>
                <Input
                  id="upload-industry"
                  placeholder="e.g., Technology, Healthcare"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  data-testid="input-upload-industry"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="upload-useCase">Use Case (Optional)</Label>
                <Input
                  id="upload-useCase"
                  placeholder="e.g., Cold outreach, Follow-up"
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  data-testid="input-upload-use-case"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-tags">Tags</Label>
              <Input
                id="upload-tags"
                placeholder="Enter tags separated by commas"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                data-testid="input-upload-tags"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose} data-testid="button-upload-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={createMutation.isPending}
                data-testid="button-upload-submit"
              >
                {createMutation.isPending ? "Adding..." : "Add Content"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
