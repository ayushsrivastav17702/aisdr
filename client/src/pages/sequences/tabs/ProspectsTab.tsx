import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { api } from "@/lib/api";
import { Plus, RefreshCw, Users, Search, AlertTriangle } from "lucide-react";

export function ProspectsTab({ sequenceId, prospects, isLoading }: { sequenceId: string; prospects: any[]; isLoading: boolean }) {
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedForEnrollment, setSelectedForEnrollment] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debounce search term
  useState(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  });

  // Fetch quota data for pre-action warning
  const { data: quotaData } = useQuery<{
    emailsUsed: number;
    emailLimit: number;
    enrollmentsUsed: number;
    enrollmentLimit: number;
  }>({
    queryKey: ["/api/sdr/quota"],
    enabled: showEnrollModal,
  });

  // Calculate quota percentages (guard against divide-by-zero)
  const emailQuotaPercent = quotaData && quotaData.emailLimit > 0
    ? (quotaData.emailsUsed / quotaData.emailLimit) * 100
    : 0;
  const enrollmentQuotaPercent = quotaData && quotaData.enrollmentLimit > 0
    ? (quotaData.enrollmentsUsed / quotaData.enrollmentLimit) * 100
    : 0;
  const showQuotaWarning = emailQuotaPercent >= 95 || enrollmentQuotaPercent >= 95;
  const quotaExceeded = emailQuotaPercent >= 100 || enrollmentQuotaPercent >= 100;

  // Load prospects with backend search
  const { data: allProspects } = useQuery({
    queryKey: ["/api/prospects", { search: debouncedSearchTerm, limit: 100 }],
    queryFn: () => api.getProspects({ search: debouncedSearchTerm, limit: 100 }),
    enabled: showEnrollModal, // Only fetch when modal is open
  });

  const prospectsList = (allProspects as any)?.prospects || [];

  const enrollMutation = useMutation({
    mutationFn: async (prospectIds: string[]) => {
      const res = await apiRequest("POST", `/api/sequences/${sequenceId}/prospects`, { prospectIds });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId, 'prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sequences', sequenceId] });
      setShowEnrollModal(false);
      setSelectedForEnrollment([]);
      toast({ title: "Prospects enrolled successfully", description: data.message || `${selectedForEnrollment.length} prospects added` });
    },
    onError: (error: Error) => {
      toast({
        title: "Enrollment failed",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Enrolled Prospects</CardTitle>
              <CardDescription>{prospects.length} prospects in this sequence</CardDescription>
            </div>
            <Button onClick={() => setShowEnrollModal(true)} data-testid="button-enroll-prospects">
              <Plus className="w-4 h-4 mr-2" />
              Enroll Prospects
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : prospects.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No prospects enrolled</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Add prospects to start your sequence</p>
              <Button onClick={() => setShowEnrollModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Enroll Prospects
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold">Name</th>
                    <th className="text-left py-3 px-4 font-semibold">Company</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Current Step</th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((item: any) => (
                    <tr key={item.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-3 px-4">
                        {item.prospect?.fullName || `${item.prospect?.firstName || ""} ${item.prospect?.lastName || ""}`.trim()}
                      </td>
                      <td className="py-3 px-4">{item.prospect?.companyName}</td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{item.status}</Badge>
                      </td>
                      <td className="py-3 px-4">{item.currentStep || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showEnrollModal} onOpenChange={(open) => {
        setShowEnrollModal(open);
        if (!open) setSelectedForEnrollment([]);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Enroll Prospects in Sequence</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Select prospects from your database to enroll in this sequence
            </p>
          </DialogHeader>

          {/* Pre-Action Quota Warning (TC-SDR-QUOTA-04) */}
          {quotaExceeded && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2" data-testid="alert-quota-exceeded">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Daily limit reached
                </p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {emailQuotaPercent >= 100 && `Email quota: ${quotaData?.emailsUsed}/${quotaData?.emailLimit} used. `}
                  {enrollmentQuotaPercent >= 100 && `Enrollment quota: ${quotaData?.enrollmentsUsed}/${quotaData?.enrollmentLimit} used.`}
                  {' '}Enrollment is blocked until quota resets.
                </p>
              </div>
            </div>
          )}

          {showQuotaWarning && !quotaExceeded && (
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2" data-testid="alert-quota-warning">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Approaching daily limit
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {emailQuotaPercent >= 95 && `Email quota: ${quotaData?.emailsUsed}/${quotaData?.emailLimit} (${Math.round(emailQuotaPercent)}% used). `}
                  {enrollmentQuotaPercent >= 95 && `Enrollment quota: ${quotaData?.enrollmentsUsed}/${quotaData?.enrollmentLimit} (${Math.round(enrollmentQuotaPercent)}% used).`}
                  {' '}Consider limiting your selection.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search prospects by name, company, or job title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-enroll-prospects"
              />
            </div>

            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-medium">
                {selectedForEnrollment.length} of {prospectsList.length} selected
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedForEnrollment.length === prospectsList.length) {
                    setSelectedForEnrollment([]);
                  } else {
                    setSelectedForEnrollment(prospectsList.map((p: any) => p.id));
                  }
                }}
              >
                {selectedForEnrollment.length === prospectsList.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto border rounded-lg p-4">
              {prospectsList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No prospects found. Import or search for prospects first.
                </div>
              ) : (
                prospectsList.map((prospect: any) => (
                  <div key={prospect.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                    <input
                      type="checkbox"
                      id={`enroll-${prospect.id}`}
                      checked={selectedForEnrollment.includes(prospect.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedForEnrollment([...selectedForEnrollment, prospect.id]);
                        } else {
                          setSelectedForEnrollment(selectedForEnrollment.filter(id => id !== prospect.id));
                        }
                      }}
                      data-testid={`checkbox-enroll-${prospect.id}`}
                    />
                    <label htmlFor={`enroll-${prospect.id}`} className="flex-1 cursor-pointer text-sm">
                      {prospect.fullName || `${prospect.firstName} ${prospect.lastName}`} - {prospect.companyName || 'No company'}
                    </label>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEnrollModal(false);
                  setSelectedForEnrollment([]);
                }}
                data-testid="button-cancel-enroll"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedForEnrollment.length > 0) {
                    enrollMutation.mutate(selectedForEnrollment);
                  }
                }}
                disabled={selectedForEnrollment.length === 0 || enrollMutation.isPending || quotaExceeded}
                data-testid="button-confirm-enroll"
              >
                {quotaExceeded ? 'Quota Exceeded' : enrollMutation.isPending ? 'Enrolling...' : `Enroll ${selectedForEnrollment.length} Prospect${selectedForEnrollment.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
