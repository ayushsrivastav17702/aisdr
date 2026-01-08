import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Building,
  Mail,
  Star,
  TrendingUp,
  DollarSign,
  Calendar,
  MessageSquare,
  ChevronRight,
  Filter,
  Plus
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending_review: { label: "Pending Review", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  accepted: { label: "Accepted", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: CheckCircle },
  converted: { label: "Converted", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: TrendingUp },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  lost: { label: "Lost", color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", icon: XCircle },
};

export default function AEHandoffPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedHandoff, setSelectedHandoff] = useState<any>(null);
  const [feedbackDialog, setFeedbackDialog] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState(0);
  const [newStatus, setNewStatus] = useState("");

  const { data: handoffsData, isLoading } = useQuery({
    queryKey: ["/api/handoffs", statusFilter, roleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (roleFilter !== "all") params.set("role", roleFilter);
      const res = await fetch(`/api/handoffs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch handoffs");
      return res.json();
    },
  });

  const { data: handoffDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["/api/handoffs", selectedHandoff?.id],
    enabled: !!selectedHandoff?.id,
    queryFn: async () => {
      const res = await fetch(`/api/handoffs/${selectedHandoff.id}`);
      if (!res.ok) throw new Error("Failed to fetch handoff");
      return res.json();
    },
  });

  const { data: conversionStats } = useQuery<{
    total: number;
    pending: number;
    accepted: number;
    converted: number;
    rejected: number;
    lost: number;
    conversionRate: string | number;
    avgQualificationScore: number;
    totalPipelineValue: number;
  }>({
    queryKey: ["/api/handoffs/stats/conversion"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/handoffs/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/handoffs"] });
      setFeedbackDialog(false);
      setFeedback("");
      setRating(0);
      toast({ title: "Handoff updated", description: "The handoff has been updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update handoff", variant: "destructive" });
    },
  });

  const handleStatusChange = (handoff: any, status: string) => {
    if (status === "rejected" || status === "accepted") {
      setSelectedHandoff(handoff);
      setNewStatus(status);
      setFeedbackDialog(true);
    } else {
      updateMutation.mutate({ id: handoff.id, data: { status } });
    }
  };

  const submitFeedback = () => {
    updateMutation.mutate({
      id: selectedHandoff.id,
      data: {
        status: newStatus,
        aeFeedback: feedback,
        aeRating: rating || undefined,
      },
    });
  };

  const getQualificationBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-100 text-green-700">High Quality</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-100 text-yellow-700">Medium Quality</Badge>;
    return <Badge className="bg-red-100 text-red-700">Low Quality</Badge>;
  };

  const renderStars = (value: number, onChange?: (v: number) => void) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-5 w-5 cursor-pointer ${
              star <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            }`}
            onClick={() => onChange?.(star)}
          />
        ))}
      </div>
    );
  };

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">AE Handoff Workflow</h1>
            <p className="text-muted-foreground mt-1">Manage prospect handoffs from SDR to Account Executives</p>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{conversionStats?.total || 0}</div>
                <div className="text-sm text-muted-foreground">Total Handoffs</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{conversionStats?.pending || 0}</div>
                <div className="text-sm text-muted-foreground">Pending Review</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{conversionStats?.conversionRate || 0}%</div>
                <div className="text-sm text-muted-foreground">Conversion Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Star className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{conversionStats?.avgQualificationScore || 0}</div>
                <div className="text-sm text-muted-foreground">Avg Quality Score</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">${(conversionStats?.totalPipelineValue || 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Pipeline Value</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48" data-testid="select-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full md:w-48" data-testid="select-role">
            <SelectValue placeholder="View as" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Handoffs</SelectItem>
            <SelectItem value="sdr">My Handoffs (SDR)</SelectItem>
            <SelectItem value="ae">Assigned to Me (AE)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-48 mb-2" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : handoffsData?.handoffs?.length > 0 ? (
        <div className="space-y-3">
          {handoffsData.handoffs.map((handoff: any) => {
            const statusConfig = STATUS_CONFIG[handoff.status] || STATUS_CONFIG.pending_review;
            const StatusIcon = statusConfig.icon;
            return (
              <Card
                key={handoff.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedHandoff(handoff)}
                data-testid={`card-handoff-${handoff.id}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{handoff.prospectName || "Unknown"}</span>
                        {getQualificationBadge(handoff.qualificationScore || 0)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Building className="h-3 w-3" />
                          {handoff.prospectCompany || "No company"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {handoff.prospectEmail || "No email"}
                        </span>
                        {handoff.meetingScheduledAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(handoff.meetingScheduledAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={statusConfig.color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusConfig.label}
                      </Badge>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {handoff.qualificationScore || 0}%
                        </div>
                        <div className="text-xs text-muted-foreground">Quality</div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No handoffs found.</p>
            <p className="text-sm mt-1">Handoffs will appear here when prospects are ready for AE follow-up.</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedHandoff && !feedbackDialog} onOpenChange={(open) => !open && setSelectedHandoff(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          {detailLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : handoffDetail?.handoff ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">
                  {handoffDetail.prospect?.fullName || "Unknown Prospect"}
                </DialogTitle>
                <DialogDescription>
                  {handoffDetail.prospect?.jobTitle} at {handoffDetail.prospect?.companyName}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[50vh]">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">SDR</Label>
                      <div className="font-medium">{handoffDetail.sdr?.fullName || "N/A"}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">AE Assigned</Label>
                      <div className="font-medium">{handoffDetail.ae?.fullName || "Unassigned"}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Qualification Framework</Label>
                      <Badge variant="outline" className="mt-1">
                        {handoffDetail.handoff.qualificationFramework?.toUpperCase() || "BANT"}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Quality Score</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={handoffDetail.handoff.qualificationScore || 0} className="h-2 flex-1" />
                        <span className="font-medium">{handoffDetail.handoff.qualificationScore || 0}%</span>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-muted-foreground mb-2 block">Qualification Details</Label>
                    {handoffDetail.handoff.qualificationFramework === "bant" ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Budget</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.budget || "Not captured"}
                          </div>
                          {handoffDetail.handoff.budgetConfirmed && (
                            <Badge variant="outline" className="mt-2 text-green-600">Confirmed</Badge>
                          )}
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Authority</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.authority || "Not captured"}
                          </div>
                          {handoffDetail.handoff.authorityConfirmed && (
                            <Badge variant="outline" className="mt-2 text-green-600">Confirmed</Badge>
                          )}
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Need</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.need || "Not captured"}
                          </div>
                          {handoffDetail.handoff.needConfirmed && (
                            <Badge variant="outline" className="mt-2 text-green-600">Confirmed</Badge>
                          )}
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Timeline</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.timeline || "Not captured"}
                          </div>
                          {handoffDetail.handoff.timelineConfirmed && (
                            <Badge variant="outline" className="mt-2 text-green-600">Confirmed</Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Metrics</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.metrics || "Not captured"}
                          </div>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Economic Buyer</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.economicBuyer || "Not captured"}
                          </div>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Decision Criteria</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.decisionCriteria || "Not captured"}
                          </div>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Decision Process</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.decisionProcess || "Not captured"}
                          </div>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Identify Pain</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.identifyPain || "Not captured"}
                          </div>
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="text-sm font-medium">Champion</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {handoffDetail.handoff.champion || "Not captured"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {handoffDetail.handoff.handoffNotes && (
                    <>
                      <Separator />
                      <div>
                        <Label className="text-muted-foreground mb-2 block">Handoff Notes</Label>
                        <div className="p-3 bg-muted rounded-lg text-sm">
                          {handoffDetail.handoff.handoffNotes}
                        </div>
                      </div>
                    </>
                  )}

                  {handoffDetail.activities?.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <Label className="text-muted-foreground mb-2 block">Activity Timeline</Label>
                        <div className="space-y-3">
                          {handoffDetail.activities.map((activity: any) => (
                            <div key={activity.id} className="flex gap-3">
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <MessageSquare className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-sm">
                                  <span className="font-medium">
                                    {`${activity.userFirstName || ""} ${activity.userLastName || ""}`.trim() || "System"}
                                  </span>
                                  <span className="text-muted-foreground"> - {activity.description}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(activity.createdAt).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {handoffDetail.handoff.status === "pending_review" && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => handleStatusChange(handoffDetail.handoff, "rejected")}
                      data-testid="button-reject"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleStatusChange(handoffDetail.handoff, "accepted")}
                      data-testid="button-accept"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Accept
                    </Button>
                  </>
                )}
                {handoffDetail.handoff.status === "accepted" && (
                  <Button
                    onClick={() => updateMutation.mutate({ id: handoffDetail.handoff.id, data: { status: "converted", outcome: "won" } })}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-convert"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Mark as Converted
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={feedbackDialog} onOpenChange={setFeedbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newStatus === "accepted" ? "Accept Handoff" : "Reject Handoff"}</DialogTitle>
            <DialogDescription>
              {newStatus === "accepted" 
                ? "Provide feedback for the SDR before accepting this handoff."
                : "Please explain why you're rejecting this handoff."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Rate Handoff Quality</Label>
              <div className="mt-2">
                {renderStars(rating, setRating)}
              </div>
            </div>
            <div>
              <Label>Feedback</Label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder={newStatus === "accepted" 
                  ? "Great qualification! Any additional context I should know?"
                  : "Please explain the reason for rejection..."}
                className="mt-2"
                rows={4}
                data-testid="textarea-feedback"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitFeedback}
              disabled={updateMutation.isPending}
              variant={newStatus === "rejected" ? "destructive" : "default"}
              data-testid="button-submit-feedback"
            >
              {updateMutation.isPending ? "Submitting..." : `${newStatus === "accepted" ? "Accept" : "Reject"} Handoff`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
}
