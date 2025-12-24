import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Trophy, 
  Medal, 
  Award, 
  Star, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  RefreshCw,
  Mail,
  MessageSquare,
  Crown,
  Flame,
  Zap,
  Clock,
  Users,
  Shield
} from "lucide-react";

const BADGE_ICONS: Record<string, any> = {
  Trophy, Star, Crown, Flame, Zap, Clock, Users, Shield, Award, TrendingUp, MessageSquare
};

export default function LeaderboardPage() {
  const { toast } = useToast();
  const [periodType, setPeriodType] = useState("weekly");

  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ["/api/leaderboard", periodType],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?periodType=${periodType}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });

  const { data: badgesData, isLoading: badgesLoading } = useQuery<{
    badges: any[];
    availableBadges: any[];
  }>({
    queryKey: ["/api/badges"],
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/leaderboard/refresh", { periodType });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
      toast({ title: "Leaderboard refreshed", description: "Stats have been updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to refresh leaderboard", variant: "destructive" });
    },
  });

  const checkBadgesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/badges/check", {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/badges"] });
      if (data.newBadges?.length > 0) {
        toast({
          title: "New Badges Earned!",
          description: `You earned ${data.newBadges.length} new badge(s)!`,
        });
      }
    },
  });

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2: return <Medal className="h-5 w-5 text-gray-400" />;
      case 3: return <Medal className="h-5 w-5 text-amber-600" />;
      default: return <span className="text-sm font-medium text-muted-foreground">#{rank}</span>;
    }
  };

  const getRankChange = (change: number | null) => {
    if (!change || change === 0) return <Minus className="h-4 w-4 text-muted-foreground" />;
    if (change > 0) return <div className="flex items-center text-green-500"><TrendingUp className="h-4 w-4 mr-1" />{change}</div>;
    return <div className="flex items-center text-red-500"><TrendingDown className="h-4 w-4 mr-1" />{Math.abs(change)}</div>;
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Leaderboard & Gamification</h1>
          <p className="text-muted-foreground mt-1">Track performance and earn badges</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => checkBadgesMutation.mutate()}
            disabled={checkBadgesMutation.isPending}
            data-testid="button-check-badges"
          >
            <Award className="h-4 w-4 mr-2" />
            Check Badges
          </Button>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            Refresh Stats
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Performance Rankings</CardTitle>
                <Tabs value={periodType} onValueChange={setPeriodType}>
                  <TabsList>
                    <TabsTrigger value="daily" data-testid="tab-daily">Daily</TabsTrigger>
                    <TabsTrigger value="weekly" data-testid="tab-weekly">Weekly</TabsTrigger>
                    <TabsTrigger value="monthly" data-testid="tab-monthly">Monthly</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              {leaderboardData?.period && (
                <CardDescription>
                  {new Date(leaderboardData.period.start).toLocaleDateString()} - {new Date(leaderboardData.period.end).toLocaleDateString()}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              ) : leaderboardData?.entries?.length > 0 ? (
                <div className="space-y-3">
                  {leaderboardData.entries.map((entry: any, index: number) => (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                        entry.userId === leaderboardData.myRank ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"
                      }`}
                      data-testid={`row-leaderboard-${index}`}
                    >
                      <div className="w-8 flex justify-center">
                        {getRankIcon(entry.rank)}
                      </div>
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{getInitials(entry.userFirstName, entry.userLastName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {`${entry.userFirstName || ""} ${entry.userLastName || ""}`.trim() || entry.userEmail}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {entry.emailsSent || 0} sent
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> {entry.repliesReceived || 0} replies
                          </span>
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3" /> {entry.positiveReplies || 0} positive
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getRankChange(entry.rankChange)}
                        <Badge variant="secondary" className="font-mono">
                          {entry.points?.toLocaleString() || 0} pts
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No leaderboard data yet.</p>
                  <p className="text-sm">Click "Refresh Stats" to calculate rankings.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {leaderboardData?.myPoints > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-3xl font-bold text-primary">#{leaderboardData.myRank || "-"}</div>
                    <div className="text-sm text-muted-foreground">Current Rank</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-3xl font-bold">{leaderboardData.myPoints?.toLocaleString() || 0}</div>
                    <div className="text-sm text-muted-foreground">Total Points</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Your Badges
              </CardTitle>
              <CardDescription>Achievements you've unlocked</CardDescription>
            </CardHeader>
            <CardContent>
              {badgesLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              ) : (badgesData?.badges?.length ?? 0) > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {badgesData?.badges?.map((badge: any) => {
                    const IconComponent = BADGE_ICONS[badge.badgeIcon] || Award;
                    return (
                      <div
                        key={badge.id}
                        className="flex flex-col items-center p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                        title={badge.badgeDescription}
                        data-testid={`badge-${badge.badgeType}`}
                      >
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center mb-2"
                          style={{ backgroundColor: `${badge.badgeColor}20`, color: badge.badgeColor }}
                        >
                          <IconComponent className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-medium text-center truncate w-full">
                          {badge.badgeName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Award className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No badges earned yet.</p>
                  <p className="text-xs">Keep sending emails to unlock achievements!</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Available Badges</CardTitle>
              <CardDescription>Achievements you can unlock</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {badgesData?.availableBadges?.map((badge: any, index: number) => {
                  const IconComponent = BADGE_ICONS[badge.icon] || Award;
                  const isEarned = badgesData?.badges?.some(
                    (b: any) => b.badgeType === badge.type && b.achievementValue === badge.threshold
                  );
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-2 rounded-lg ${
                        isEarned ? "opacity-50" : ""
                      }`}
                    >
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: isEarned ? "#ccc" : `${badge.color}20`,
                          color: isEarned ? "#999" : badge.color,
                        }}
                      >
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2">
                          {badge.name}
                          {isEarned && <Badge variant="outline" className="text-xs">Earned</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {badge.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
