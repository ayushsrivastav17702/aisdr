import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { api, type JobResponse } from "@/lib/api";
import {
  XIcon,
  StopCircleIcon,
  TrashIcon,
  ArrowRightIcon,
  HistoryIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";

interface JobDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function JobDrawer({ open, onClose }: JobDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["/api/jobs"],
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
    enabled: open,
  });

  const cancelJobMutation = useMutation({
    mutationFn: api.cancelJob,
    onSuccess: () => {
      toast({
        title: "Job Cancelled",
        description: "Job has been cancelled successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Failed to Cancel",
        description: error.message,
      });
    },
  });

  const activeJobs = jobs.filter(job => job.status === "running" || job.status === "queued");
  const completedJobs = jobs.filter(job => job.status === "completed");
  const failedJobs = jobs.filter(job => job.status === "failed");

  const getJobIcon = (type: string) => {
    switch (type) {
      case "enrichment": return <SparklesIcon className="w-5 h-5" />;
      case "import": return <FileTextIcon className="w-5 h-5" />;
      case "search": return <SearchIcon className="w-5 h-5" />;
      default: return <FileTextIcon className="w-5 h-5" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20">
            Running
          </Badge>
        );
      case "queued":
        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">
            Queued
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-rose-50 text-rose-700 border-rose-200">
            Failed
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getProgressPercentage = (job: JobResponse) => {
    if (job.totalItems === 0) return 0;
    return Math.floor((job.processedItems / job.totalItems) * 100);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return `${Math.floor(diffInMinutes / 1440)} days ago`;
  };

  const renderJobCard = (job: JobResponse) => {
    const isActive = job.status === "running" || job.status === "queued";
    const isCompleted = job.status === "completed";
    const progress = getProgressPercentage(job);

    return (
      <Card 
        key={job.id} 
        className={`${isActive ? 'border-primary/20 hover:border-primary' : ''} transition-colors`}
        data-testid={`job-card-${job.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${
                  job.status === "running" ? "bg-primary animate-pulse" : 
                  job.status === "completed" ? "bg-emerald-500" :
                  job.status === "failed" ? "bg-rose-500" :
                  "bg-muted-foreground"
                }`} />
                <h4 className="text-sm font-semibold" data-testid={`job-title-${job.id}`}>
                  {job.title}
                </h4>
              </div>
              <p className="text-xs text-muted-foreground" data-testid={`job-description-${job.id}`}>
                {job.description}
              </p>
            </div>
            <div data-testid={`job-status-${job.id}`}>
              {getStatusBadge(job.status)}
            </div>
          </div>

          {isActive && (
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium" data-testid={`job-progress-text-${job.id}`}>
                  {job.processedItems} of {job.totalItems}
                </span>
              </div>
              <Progress value={progress} className="h-2" data-testid={`job-progress-bar-${job.id}`} />
            </div>
          )}

          {(job.successCount > 0 || job.failureCount > 0 || job.partialCount > 0) && (
            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
              <div className="text-center p-2 rounded bg-emerald-50">
                <p className="font-semibold text-emerald-700" data-testid={`job-success-${job.id}`}>
                  {job.successCount}
                </p>
                <p className="text-emerald-600">Success</p>
              </div>
              {job.partialCount > 0 && (
                <div className="text-center p-2 rounded bg-amber-50">
                  <p className="font-semibold text-amber-700" data-testid={`job-partial-${job.id}`}>
                    {job.partialCount}
                  </p>
                  <p className="text-amber-600">Partial</p>
                </div>
              )}
              {job.failureCount > 0 && (
                <div className="text-center p-2 rounded bg-rose-50">
                  <p className="font-semibold text-rose-700" data-testid={`job-failure-${job.id}`}>
                    {job.failureCount}
                  </p>
                  <p className="text-rose-600">Failed</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
            <span className="flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              {job.status === "running" && job.startedAt ? (
                <>Started {formatTimeAgo(job.startedAt)}</>
              ) : job.status === "completed" && job.completedAt ? (
                <>Completed {formatTimeAgo(job.completedAt)}</>
              ) : (
                <>Created {formatTimeAgo(job.createdAt)}</>
              )}
            </span>

            <div className="flex items-center gap-1">
              {isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive/80 h-auto p-1"
                  onClick={() => cancelJobMutation.mutate(job.id)}
                  disabled={cancelJobMutation.isPending}
                  data-testid={`button-cancel-job-${job.id}`}
                >
                  <StopCircleIcon className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              )}
              
              {isCompleted && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary hover:text-primary/80 h-auto p-1"
                  data-testid={`button-view-results-${job.id}`}
                >
                  View <ArrowRightIcon className="w-3 h-3 ml-1" />
                </Button>
              )}
              
              {job.status === "failed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive/80 h-auto p-1"
                  data-testid={`button-delete-job-${job.id}`}
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-96 flex flex-col" data-testid="sheet-job-drawer">
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle data-testid="drawer-title">Active Jobs</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1" data-testid="active-jobs-count">
                {activeJobs.length} jobs running
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              data-testid="button-close-drawer"
            >
              <XIcon className="w-4 h-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading jobs...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No jobs found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Jobs will appear here when you start imports or enrichments
              </p>
            </div>
          ) : (
            <>
              {/* Active Jobs */}
              {activeJobs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Running & Queued ({activeJobs.length})
                  </h4>
                  {activeJobs.map(renderJobCard)}
                </div>
              )}

              {/* Completed Jobs */}
              {completedJobs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Recent Completed ({Math.min(completedJobs.length, 5)})
                  </h4>
                  {completedJobs.slice(0, 5).map(renderJobCard)}
                </div>
              )}

              {/* Failed Jobs */}
              {failedJobs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Failed Jobs ({failedJobs.length})
                  </h4>
                  {failedJobs.map(renderJobCard)}
                </div>
              )}
            </>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          <Button 
            variant="outline" 
            className="w-full" 
            data-testid="button-view-job-history"
          >
            <HistoryIcon className="w-4 h-4 mr-2" />
            View Job History
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
