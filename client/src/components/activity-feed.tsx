import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Activity, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Mail,
  Users,
  Target,
  Settings,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, any> | null;
  duration: number | null;
  createdAt: string;
}

interface ActivityResponse {
  activities: ActivityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const ACTION_ICONS: Record<string, any> = {
  "email": Mail,
  "sequence": Target,
  "prospect": Users,
  "campaign": Target,
  "settings": Settings,
  "error": AlertCircle,
  "success": CheckCircle,
  "login": Zap
};

const TARGET_TYPES = [
  { value: "all", label: "All Types" },
  { value: "email", label: "Emails" },
  { value: "sequence", label: "Sequences" },
  { value: "prospect", label: "Prospects" },
  { value: "campaign", label: "Campaigns" }
];

function getActionIcon(action: string, targetType: string | null) {
  if (action.includes("error") || action.includes("fail")) return AlertCircle;
  if (action.includes("success") || action.includes("complete")) return CheckCircle;
  if (targetType && ACTION_ICONS[targetType]) return ACTION_ICONS[targetType];
  
  const actionParts = action.split(".");
  if (actionParts[0] && ACTION_ICONS[actionParts[0]]) {
    return ACTION_ICONS[actionParts[0]];
  }
  return Activity;
}

function getActionColor(action: string): string {
  if (action.includes("error") || action.includes("fail") || action.includes("bounce")) {
    return "text-destructive";
  }
  if (action.includes("success") || action.includes("complete") || action.includes("sent")) {
    return "text-green-600 dark:text-green-400";
  }
  if (action.includes("pause") || action.includes("block")) {
    return "text-yellow-600 dark:text-yellow-400";
  }
  return "text-muted-foreground";
}

function formatAction(action: string): string {
  return action
    .split(/[._]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [targetType, setTargetType] = useState("all");

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "20",
    ...(searchQuery && { action: searchQuery }),
    ...(targetType !== "all" && { targetType })
  });

  const { data, isLoading, isFetching } = useQuery<ActivityResponse>({
    queryKey: ["/api/sdr/activity", page, searchQuery, targetType],
    queryFn: async () => {
      const res = await fetch(`/api/sdr/activity?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    }
  });

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleTypeChange = (value: string) => {
    setTargetType(value);
    setPage(1);
  };

  return (
    <Card data-testid="card-activity-feed">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
            </CardTitle>
            <CardDescription>
              Your actions and system events from the past 90 days
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search actions..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8 w-48"
                data-testid="input-search-activity"
              />
            </div>
            <Select value={targetType} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-32" data-testid="select-target-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ActivitySkeleton />
        ) : !data || data.activities.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No activity found</p>
            <p className="text-sm">Your actions will appear here as you use the platform</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.activities.map((activity) => {
              const Icon = getActionIcon(activity.action, activity.targetType);
              const colorClass = getActionColor(activity.action);
              
              return (
                <div 
                  key={activity.id} 
                  className={cn(
                    "flex items-start gap-3 p-3 border rounded-lg transition-colors",
                    isFetching && "opacity-50"
                  )}
                  data-testid={`activity-item-${activity.id}`}
                >
                  <div className={cn("p-2 rounded-full bg-muted", colorClass)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{formatAction(activity.action)}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      {activity.targetType && (
                        <Badge variant="outline" className="text-xs">
                          {activity.targetType}
                        </Badge>
                      )}
                      {activity.targetId && (
                        <span className="text-xs text-muted-foreground truncate max-w-32">
                          ID: {activity.targetId.slice(0, 8)}...
                        </span>
                      )}
                      {activity.duration && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {activity.duration}ms
                        </span>
                      )}
                    </div>
                    {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {JSON.stringify(activity.metadata).slice(0, 100)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} activities)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isFetching}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= data.pagination.totalPages || isFetching}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
