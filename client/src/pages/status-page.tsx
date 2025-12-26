import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Globe, 
  Database, 
  Mail, 
  Server, 
  Clock,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "outage";
  latency?: number;
  lastChecked: string;
}

interface PlatformStatus {
  overall: "operational" | "degraded" | "outage";
  services: ServiceStatus[];
  lastUpdated: string;
  uptime: string;
  incidents: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  }[];
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "operational":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "degraded":
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    case "outage":
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-gray-500" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive"> = {
    operational: "default",
    degraded: "secondary",
    outage: "destructive",
  };
  
  return (
    <Badge variant={variants[status] || "secondary"} className="capitalize">
      {status}
    </Badge>
  );
}

function ServiceIcon({ name }: { name: string }) {
  const lower = name.toLowerCase();
  if (lower.includes("api")) return <Server className="h-5 w-5" />;
  if (lower.includes("web")) return <Globe className="h-5 w-5" />;
  if (lower.includes("database")) return <Database className="h-5 w-5" />;
  if (lower.includes("email")) return <Mail className="h-5 w-5" />;
  return <Server className="h-5 w-5" />;
}

export default function StatusPage() {
  const { data: status, isLoading, refetch, isFetching } = useQuery<PlatformStatus>({
    queryKey: ["/api/status"],
    queryFn: async () => {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const overallStatusColor = {
    operational: "bg-green-500",
    degraded: "bg-yellow-500",
    outage: "bg-red-500",
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="status-page-title">
            AiSDR Platform Status
          </h1>
          <p className="text-gray-500">
            Real-time status of all platform services
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
            <p className="mt-4 text-gray-500">Loading status...</p>
          </div>
        ) : (
          <>
            <Card className="mb-8" data-testid="overall-status-card">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div 
                      className={`w-4 h-4 rounded-full ${overallStatusColor[status?.overall || "operational"]} animate-pulse`}
                    />
                    <div>
                      <h2 className="text-xl font-semibold capitalize" data-testid="overall-status">
                        {status?.overall === "operational" 
                          ? "All Systems Operational" 
                          : status?.overall === "degraded"
                          ? "Some Systems Degraded"
                          : "System Outage Detected"}
                      </h2>
                      <p className="text-sm text-gray-500">
                        Last updated: {status?.lastUpdated ? new Date(status.lastUpdated).toLocaleString() : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Uptime (30 days)</p>
                      <p className="text-lg font-semibold text-green-600" data-testid="uptime-percentage">
                        {status?.uptime || "99.9%"}
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => refetch()}
                      disabled={isFetching}
                      data-testid="button-refresh-status"
                    >
                      <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-8" data-testid="services-status-card">
              <CardHeader>
                <CardTitle>Service Status</CardTitle>
                <CardDescription>Current status of all platform services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {status?.services?.map((service, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      data-testid={`service-status-${service.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <div className="flex items-center gap-3">
                        <ServiceIcon name={service.name} />
                        <div>
                          <p className="font-medium">{service.name}</p>
                          {service.latency && (
                            <p className="text-sm text-gray-500">
                              Response time: {service.latency}ms
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusIcon status={service.status} />
                        <StatusBadge status={service.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="incidents-card">
              <CardHeader>
                <CardTitle>Recent Incidents</CardTitle>
                <CardDescription>Last 7 days of incident history</CardDescription>
              </CardHeader>
              <CardContent>
                {status?.incidents && status.incidents.length > 0 ? (
                  <div className="space-y-4">
                    {status.incidents.map((incident) => (
                      <div 
                        key={incident.id} 
                        className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        data-testid={`incident-${incident.id}`}
                      >
                        <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                        <div>
                          <p className="font-medium">{incident.title}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(incident.createdAt).toLocaleString()} - {incident.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500" data-testid="no-incidents">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p>No incidents reported in the last 7 days</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="text-center mt-8 text-sm text-gray-500">
              <p>
                For support, please contact <a href="mailto:support@aisdr.com" className="text-blue-500 hover:underline">support@aisdr.com</a>
              </p>
              <p className="mt-2">
                This page auto-refreshes every 30 seconds
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
