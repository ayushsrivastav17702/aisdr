import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, FileText, Upload, Trash2, Eye, Plus, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface ContentLibraryItem {
  id: string;
  name: string;
  type: 'template' | 'snippet' | 'document' | 'attachment';
  category: string;
  content: string;
  fileUrl?: string;
  fileType?: string;
  extractedContent?: string;
  uploadedBy?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface ContentManagementUIProps {
  open: boolean;
  onClose: () => void;
}

export function ContentManagementUI({ open, onClose }: ContentManagementUIProps) {
  const [showNewItemDialog, setShowNewItemDialog] = useState(false);
  const [previewItem, setPreviewItem] = useState<ContentLibraryItem | null>(null);
  const { toast } = useToast();

  const { data: items, isLoading } = useQuery<ContentLibraryItem[]>({
    queryKey: ['/api/content-library'],
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/content-library/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content-library'] });
      toast({
        title: 'Deleted',
        description: 'Content item deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete item',
        variant: 'destructive',
      });
    },
  });

  const getTypeIcon = (type: ContentLibraryItem['type']) => {
    switch (type) {
      case 'template':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'document':
        return <FileText className="w-4 h-4 text-green-500" />;
      case 'attachment':
        return <Download className="w-4 h-4 text-purple-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'cold_outreach': 'bg-blue-500',
      'follow_up': 'bg-green-500',
      'breakup': 'bg-red-500',
      're_engagement': 'bg-purple-500',
      'general': 'bg-gray-500',
    };
    return colors[category] || 'bg-gray-500';
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-content-management">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Content Library</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage email templates, documents, and attachments
                </p>
              </div>
              <Button onClick={() => setShowNewItemDialog(true)} data-testid="button-new-item">
                <Plus className="mr-2 h-4 w-4" />
                New Item
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && (!items || items.length === 0) && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No Content Yet</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Create your first template or upload a document to get started
                  </p>
                  <Button onClick={() => setShowNewItemDialog(true)} className="mt-4" data-testid="button-create-first">
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Item
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isLoading && items && items.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <Card key={item.id} data-testid={`card-content-${item.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(item.type)}
                          <CardTitle className="text-base">{item.name}</CardTitle>
                        </div>
                        <Badge className={`${getCategoryColor(item.category)} text-white text-xs`}>
                          {item.category.replace('_', ' ')}
                        </Badge>
                      </div>
                      <CardDescription>
                        {item.type.charAt(0).toUpperCase() + item.type.slice(1)} • v{item.version}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-sm text-muted-foreground line-clamp-3">
                        {item.content || item.extractedContent || 'No preview available'}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                        {item.uploadedBy && <span>by {item.uploadedBy}</span>}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewItem(item)}
                          data-testid={`button-preview-${item.id}`}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Preview
                        </Button>
                        {item.fileUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(item.fileUrl, '_blank')}
                            data-testid={`button-download-${item.id}`}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(item.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${item.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={onClose} data-testid="button-close">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NewContentItemDialog
        open={showNewItemDialog}
        onClose={() => setShowNewItemDialog(false)}
      />

      <PreviewDialog
        item={previewItem}
        onClose={() => setPreviewItem(null)}
      />
    </>
  );
}

function NewContentItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'template' | 'snippet' | 'document' | 'attachment'>('template');
  const [category, setCategory] = useState('general');
  const [content, setContent] = useState('');
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/content-library', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/content-library'] });
      toast({
        title: 'Created',
        description: 'Content item created successfully',
      });
      onClose();
      setName('');
      setContent('');
    },
    onError: (error) => {
      toast({
        title: 'Creation Failed',
        description: error instanceof Error ? error.message : 'Failed to create item',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !content.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Name and content are required',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      name,
      type,
      category,
      content,
      version: 1,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="dialog-new-content">
        <DialogHeader>
          <DialogTitle>Create Content Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cold Outreach Template"
              data-testid="input-content-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger id="type" data-testid="select-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">Template</SelectItem>
                  <SelectItem value="snippet">Snippet</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="attachment">Attachment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category" data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                  <SelectItem value="breakup">Breakup</SelectItem>
                  <SelectItem value="re_engagement">Re-engagement</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your content here..."
              rows={10}
              data-testid="textarea-content"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createMutation.isPending}
              data-testid="button-create"
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({ 
  item, 
  onClose 
}: { 
  item: ContentLibraryItem | null; 
  onClose: () => void 
}) {
  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-preview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {item.name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {item.type} • {item.category} • v{item.version}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <pre className="text-sm whitespace-pre-wrap font-sans">
              {item.content || item.extractedContent}
            </pre>
          </div>

          {item.fileUrl && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span className="text-sm">{item.fileType || 'File attached'}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(item.fileUrl, '_blank')}
                data-testid="button-download-preview"
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose} data-testid="button-close-preview">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
