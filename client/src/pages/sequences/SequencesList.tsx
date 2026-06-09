import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  MessageSquare, Zap, ArrowLeft, Plus, Trash2, Mail, MailOpen, Reply,
  Search, Grid3x3, List, AlertTriangle
} from "lucide-react";
import { AutomationModal } from "@/components/AutomationModal";
import { HelpTooltip } from "@/components/HelpTooltip";
import { CreateSequenceButton } from "./CreateSequenceButton";

function EnhancedSequenceCard({ sequence }: { sequence: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAutomationModal, setShowAutomationModal] = useState(false);

  // Calculate metrics
  const emailCount = sequence.steps?.length || 0;
  const totalProspects = sequence.totalProspects || 0;
  const sentCount = sequence.sentCount || 0;
  const openedCount = sequence.openedCount || 0;
  const repliedCount = sequence.repliedCount || 0;
  const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;
  const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/sequences/${sequence.id}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete sequence", variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'paused': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <>
      <Card className="group hover:shadow-xl transition-all duration-200 cursor-pointer relative overflow-hidden" onClick={() => setLocation(`/sequences/${sequence.id}`)} data-testid={`card-sequence-${sequence.id}`}>
        {sequence.status === 'active' && (
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-green-500 to-emerald-500"></div>
        )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold truncate">{sequence.name}</CardTitle>
            {sequence.description && (
              <CardDescription className="mt-1 line-clamp-2">{sequence.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${getStatusColor(sequence.status)}`} data-testid={`badge-status-${sequence.id}`}>
              {sequence.status}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setShowAutomationModal(true);
              }}
              data-testid={`button-automation-${sequence.id}`}
              title="Run Automation"
            >
              <Zap className="h-4 w-4 text-blue-500" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-delete-${sequence.id}`}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Sequence</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{sequence.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-gray-500">Emails</span>
            </div>
            <div className="text-2xl font-bold">{emailCount}</div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-gray-500">Prospects</span>
            </div>
            <div className="text-2xl font-bold">{totalProspects}</div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <MailOpen className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">Open Rate</span>
            </div>
            <div className="text-2xl font-bold">{openRate}%</div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Reply className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-gray-500">Reply Rate</span>
            </div>
            <div className="text-2xl font-bold">{replyRate}%</div>
          </div>
        </div>

        {/* Progress indicator for active sequences */}
        {sequence.status === 'active' && totalProspects > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>{sentCount} sent</span>
              <span>{totalProspects - sentCount} remaining</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-full transition-all duration-500"
                style={{ width: `${totalProspects > 0 ? (sentCount / totalProspects) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-500">
            {sequence.createdAt ? `Created ${new Date(sequence.createdAt).toLocaleDateString()}` : 'Recently created'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setLocation(`/sequences/${sequence.id}`);
            }}
          >
            View Details →
          </Button>
        </div>
      </CardContent>
      </Card>

      {showAutomationModal && (
        <AutomationModal
          sequenceId={sequence.id}
          sequenceName={sequence.name}
          open={showAutomationModal}
          onClose={() => setShowAutomationModal(false)}
        />
      )}
    </>
  );
}

function SequenceListItem({ sequence }: { sequence: any }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAutomationModal, setShowAutomationModal] = useState(false);

  const emailCount = sequence.steps?.length || 0;
  const totalProspects = sequence.totalProspects || 0;
  const sentCount = sequence.sentCount || 0;
  const openedCount = sequence.openedCount || 0;
  const repliedCount = sequence.repliedCount || 0;
  const openRate = sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0;
  const replyRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/sequences/${sequence.id}`, undefined);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete sequence", variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'paused': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'completed': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <>
      <Card className="group hover:shadow-lg transition-all cursor-pointer" onClick={() => setLocation(`/sequences/${sequence.id}`)} data-testid={`list-item-${sequence.id}`}>
        <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Name & Description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-semibold truncate">{sequence.name}</h3>
              <Badge className={getStatusColor(sequence.status)}>
                {sequence.status}
              </Badge>
            </div>
            {sequence.description && (
              <p className="text-sm text-gray-500 truncate">{sequence.description}</p>
            )}
          </div>

          {/* Metrics */}
          <div className="hidden md:flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="font-semibold">{emailCount}</div>
              <div className="text-xs text-gray-500">Emails</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{totalProspects}</div>
              <div className="text-xs text-gray-500">Prospects</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{sentCount}</div>
              <div className="text-xs text-gray-500">Sent</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{openRate}%</div>
              <div className="text-xs text-gray-500">Opens</div>
            </div>
            <div className="text-center">
              <div className="font-semibold">{replyRate}%</div>
              <div className="text-xs text-gray-500">Replies</div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setLocation(`/sequences/${sequence.id}`);
              }}
            >
              Open →
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                setShowAutomationModal(true);
              }}
              data-testid={`button-automation-list-${sequence.id}`}
              title="Run Automation"
            >
              <Zap className="h-4 w-4 text-blue-500" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-delete-list-${sequence.id}`}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Sequence</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{sequence.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
      </Card>

      {showAutomationModal && (
        <AutomationModal
          sequenceId={sequence.id}
          sequenceName={sequence.name}
          open={showAutomationModal}
          onClose={() => setShowAutomationModal(false)}
        />
      )}
    </>
  );
}

export function SequencesList() {
  const { data: sequencesData, isLoading } = useQuery<{ sequences: any[]; total: number }>({
    queryKey: ["/api/sequences"],
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const sequencesList = Array.isArray(sequencesData?.sequences) ? sequencesData.sequences : [];

  // Filter and search sequences
  const filteredSequences = sequencesList.filter((seq: any) => {
    const matchesSearch = seq.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (seq.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || seq.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Sequences</h1>
                <HelpTooltip moduleId="sequences" itemId="create-sequence" />
              </div>
              <p className="text-gray-500 dark:text-gray-400">Create and manage email sequences</p>
            </div>
          </div>
          <CreateSequenceButton />
        </div>

        {/* Toolbar */}
        {sequencesList.length > 0 && (
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-3 flex-1 max-w-2xl w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search sequences..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-sequences"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="filter-status">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Toggle */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                data-testid="view-grid"
              >
                <Grid3x3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                data-testid="view-list"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16">Loading sequences...</div>
        ) : filteredSequences.length === 0 && sequencesList.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sequences yet</h3>
              <p className="text-gray-500 mb-6">Create your first email sequence to get started</p>
              <CreateSequenceButton />
            </CardContent>
          </Card>
        ) : filteredSequences.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No sequences found</h3>
              <p className="text-gray-500">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSequences.map((sequence: any) => (
              <EnhancedSequenceCard key={sequence.id} sequence={sequence} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSequences.map((sequence: any) => (
              <SequenceListItem key={sequence.id} sequence={sequence} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
