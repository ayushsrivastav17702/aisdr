import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Star, 
  StarHalf, 
  Clock, 
  Eye, 
  Copy, 
  BookOpen,
  FileText,
  Video,
  Mail,
  Type,
  Shield,
  Briefcase,
  PhoneOutgoing,
  RefreshCw,
  Calendar,
  ChevronRight,
  ThumbsUp,
  X
} from "lucide-react";

const CATEGORY_ICONS: Record<string, any> = {
  Mail, Type, Shield, Briefcase, PhoneOutgoing, RefreshCw, Calendar, Video
};

const CONTENT_TYPE_ICONS: Record<string, any> = {
  template: Mail,
  guide: BookOpen,
  article: FileText,
  video: Video,
};

export default function BestPracticesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedContentType, setSelectedContentType] = useState("all");
  const [selectedPractice, setSelectedPractice] = useState<any>(null);
  const [userRating, setUserRating] = useState(0);

  const { data: categoriesData } = useQuery<{ categories: any[] }>({
    queryKey: ["/api/best-practices/categories"],
  });

  const { data: practicesData, isLoading } = useQuery({
    queryKey: ["/api/best-practices", selectedCategory, selectedContentType, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (selectedContentType !== "all") params.set("contentType", selectedContentType);
      if (search) params.set("search", search);
      const res = await fetch(`/api/best-practices?${params}`);
      if (!res.ok) throw new Error("Failed to fetch practices");
      return res.json();
    },
  });

  const { data: practiceDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/best-practices", selectedPractice?.slug],
    enabled: !!selectedPractice?.slug,
    queryFn: async () => {
      const res = await fetch(`/api/best-practices/${selectedPractice.slug}`);
      if (!res.ok) throw new Error("Failed to fetch practice");
      return res.json();
    },
  });

  const useMutation_ = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/best-practices/${id}/use`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.templateSubject || data.templateBody) {
        navigator.clipboard.writeText(data.templateBody || "");
        toast({ title: "Template copied!", description: "Paste it into your email composer" });
      } else {
        toast({ title: "Template used", description: "Usage count updated" });
      }
    },
  });

  const rateMutation = useMutation({
    mutationFn: async ({ id, rating }: { id: string; rating: number }) => {
      const res = await apiRequest("POST", `/api/best-practices/${id}/rate`, { rating });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/best-practices"] });
      toast({ title: "Thanks for your feedback!" });
    },
  });

  const renderStars = (rating: number, interactive = false, onRate?: (r: number) => void) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const filled = i <= rating;
      stars.push(
        <Star
          key={i}
          className={`h-4 w-4 ${filled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"} ${
            interactive ? "cursor-pointer hover:text-yellow-400" : ""
          }`}
          onClick={interactive ? () => onRate?.(i) : undefined}
        />
      );
    }
    return <div className="flex items-center gap-0.5">{stars}</div>;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "intermediate": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "advanced": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Best Practices Library</h1>
        <p className="text-muted-foreground mt-1">Templates, guides, and strategies for effective outreach</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates, guides, and articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full md:w-48" data-testid="select-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoriesData?.categories?.map((cat: any) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedContentType} onValueChange={setSelectedContentType}>
          <SelectTrigger className="w-full md:w-48" data-testid="select-content-type">
            <SelectValue placeholder="Content Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="template">Templates</SelectItem>
            <SelectItem value="guide">Guides</SelectItem>
            <SelectItem value="article">Articles</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 flex-wrap">
        {categoriesData?.categories?.map((cat: any) => {
          const IconComponent = CATEGORY_ICONS[cat.icon] || BookOpen;
          return (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? "all" : cat.id)}
              className="gap-2"
              data-testid={`button-category-${cat.slug}`}
            >
              <IconComponent className="h-4 w-4" />
              {cat.name}
            </Button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : practicesData?.practices?.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {practicesData.practices.map((practice: any) => {
            const ContentIcon = CONTENT_TYPE_ICONS[practice.contentType] || FileText;
            return (
              <Card
                key={practice.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedPractice(practice)}
                data-testid={`card-practice-${practice.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${practice.categoryColor}20`, color: practice.categoryColor }}
                      >
                        <ContentIcon className="h-4 w-4" />
                      </div>
                      {practice.isFeatured && (
                        <Badge variant="secondary" className="text-xs">Featured</Badge>
                      )}
                    </div>
                    <Badge className={getDifficultyColor(practice.difficulty)}>
                      {practice.difficulty}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg mt-2 line-clamp-2">{practice.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{practice.description}</CardDescription>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex flex-wrap gap-1">
                    {practice.tags?.slice(0, 3).map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                  <div className="flex items-center gap-3">
                    {renderStars(practice.rating || 0)}
                    <span>({practice.ratingCount || 0})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {practice.viewCount || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {practice.estimatedReadTime || 1}m
                    </span>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No best practices found.</p>
            <p className="text-sm mt-1">Try adjusting your search or filters.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedPractice} onOpenChange={(open) => !open && setSelectedPractice(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          {detailLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : practiceDetail?.practice ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-xl">{practiceDetail.practice.title}</DialogTitle>
                    <DialogDescription className="mt-2">{practiceDetail.practice.description}</DialogDescription>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <Badge className={getDifficultyColor(practiceDetail.practice.difficulty)}>
                    {practiceDetail.practice.difficulty}
                  </Badge>
                  {practiceDetail.practice.category && (
                    <Badge variant="outline">{practiceDetail.practice.category.name}</Badge>
                  )}
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {practiceDetail.practice.estimatedReadTime || 1} min read
                  </span>
                </div>
              </DialogHeader>

              <ScrollArea className="max-h-[50vh] mt-4">
                {practiceDetail.practice.contentType === "template" ? (
                  <div className="space-y-4">
                    {practiceDetail.practice.templateSubject && (
                      <div className="p-4 bg-muted rounded-lg">
                        <div className="text-sm font-medium mb-2">Subject Line:</div>
                        <div className="font-mono text-sm">{practiceDetail.practice.templateSubject}</div>
                      </div>
                    )}
                    {practiceDetail.practice.templateBody && (
                      <div className="p-4 bg-muted rounded-lg">
                        <div className="text-sm font-medium mb-2">Email Body:</div>
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: practiceDetail.practice.templateBody }}
                        />
                      </div>
                    )}
                    {practiceDetail.practice.templateVariables?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-sm text-muted-foreground">Variables:</span>
                        {practiceDetail.practice.templateVariables.map((v: string) => (
                          <Badge key={v} variant="outline">{`{{${v}}}`}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: practiceDetail.practice.content || "" }}
                  />
                )}
              </ScrollArea>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">Rate this:</span>
                  {renderStars(userRating, true, (r) => {
                    setUserRating(r);
                    rateMutation.mutate({ id: practiceDetail.practice.id, rating: r });
                  })}
                </div>
                <div className="flex gap-2">
                  {practiceDetail.practice.contentType === "template" && (
                    <Button
                      onClick={() => useMutation_.mutate(practiceDetail.practice.id)}
                      disabled={useMutation_.isPending}
                      data-testid="button-use-template"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Template
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedPractice(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
