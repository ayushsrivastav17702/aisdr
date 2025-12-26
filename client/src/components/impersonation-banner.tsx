import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, LogOut } from "lucide-react";

interface ImpersonationInfo {
  managerName: string;
  managerEmail: string;
  tenantName: string;
  logId: string;
  startTime: string;
}

export function ImpersonationBanner() {
  const [impersonationInfo, setImpersonationInfo] = useState<ImpersonationInfo | null>(null);

  useEffect(() => {
    const checkImpersonation = () => {
      const stored = sessionStorage.getItem("impersonation_info");
      if (stored) {
        try {
          setImpersonationInfo(JSON.parse(stored));
        } catch {
          setImpersonationInfo(null);
        }
      } else {
        setImpersonationInfo(null);
      }
    };

    checkImpersonation();
    
    window.addEventListener("storage", checkImpersonation);
    return () => window.removeEventListener("storage", checkImpersonation);
  }, []);

  const handleEndImpersonation = async () => {
    if (!impersonationInfo) return;

    try {
      await fetch(`/api/super-admin/impersonation/${impersonationInfo.logId}/end`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Failed to end impersonation:", error);
    } finally {
      sessionStorage.removeItem("impersonation_info");
      sessionStorage.removeItem("impersonation_log_id");
      // Redirect to super admin dashboard instead of closing window
      window.location.href = "/super-admin";
    }
  };

  if (!impersonationInfo) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-black px-4 py-2 flex items-center justify-between shadow-lg"
      data-testid="impersonation-banner"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5" />
        <span className="font-medium">
          You are viewing as <strong>{impersonationInfo.managerName}</strong> ({impersonationInfo.managerEmail}) from <strong>{impersonationInfo.tenantName}</strong>
        </span>
        <span className="text-sm opacity-75">
          Started: {new Date(impersonationInfo.startTime).toLocaleTimeString()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleEndImpersonation}
          className="bg-white hover:bg-gray-100 text-black border-black"
          data-testid="button-end-impersonation"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Exit Impersonation
        </Button>
      </div>
    </div>
  );
}

export function setImpersonationInfo(info: Omit<ImpersonationInfo, 'startTime'>) {
  const fullInfo: ImpersonationInfo = {
    ...info,
    startTime: new Date().toISOString(),
  };
  sessionStorage.setItem("impersonation_info", JSON.stringify(fullInfo));
}

export function clearImpersonationInfo() {
  sessionStorage.removeItem("impersonation_info");
  sessionStorage.removeItem("impersonation_log_id");
}
