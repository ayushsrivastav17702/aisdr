import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

export function TrackingTab({ sequenceId }: { sequenceId: string }) {
  const { data: emails } = useQuery({
    queryKey: ['/api/sequences', sequenceId, 'emails'],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sequences/${sequenceId}/emails`, undefined);
      return await res.json();
    },
  });

  const emailsList = Array.isArray(emails) ? emails : [];

  const stats = {
    sent: emailsList.filter((e: any) => e.sentAt).length,
    delivered: emailsList.filter((e: any) => e.deliveredAt).length,
    opened: emailsList.filter((e: any) => e.openedAt).length,
    replied: emailsList.filter((e: any) => e.repliedAt).length,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Tracking & Analytics</CardTitle>
        <CardDescription>Monitor your sequence performance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Sent</p>
                <p className="text-3xl font-bold">{stats.sent}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Delivered</p>
                <p className="text-3xl font-bold">{stats.delivered}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Opened</p>
                <p className="text-3xl font-bold">{stats.opened}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">Replied</p>
                <p className="text-3xl font-bold">{stats.replied}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold">Recent Emails</h3>
          {emailsList.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No emails sent yet</p>
          )}
          {emailsList.slice(0, 10).map((email: any) => (
            <div key={email.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <p className="font-medium">{email.subject}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  To: {email.prospect?.fullName} • {new Date(email.sentAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={email.status === 'sent' ? 'default' : 'secondary'}>
                {email.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
