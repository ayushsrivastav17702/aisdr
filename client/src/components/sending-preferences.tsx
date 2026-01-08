import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Settings, Clock, MessageSquare, Save, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SendingPreferences {
  sendWindowStart: number;
  sendWindowEnd: number;
  excludeWeekends: boolean;
  defaultTone: 'professional' | 'casual' | 'consultative' | 'direct';
  defaultSignature: string;
  timezone: string;
}

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" }
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`
}));

const TONES = [
  { value: "professional", label: "Professional", description: "Formal and business-like" },
  { value: "casual", label: "Casual", description: "Friendly and approachable" },
  { value: "consultative", label: "Consultative", description: "Expert and advisory" },
  { value: "direct", label: "Direct", description: "Straightforward and concise" }
];

export function SendingPreferences() {
  const { toast } = useToast();
  const [formData, setFormData] = useState<SendingPreferences | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<SendingPreferences>({
    queryKey: ["/api/sdr/preferences"]
  });

  useEffect(() => {
    if (data && !formData) {
      setFormData(data);
    }
  }, [data, formData]);

  const mutation = useMutation({
    mutationFn: async (updates: Partial<SendingPreferences>) => {
      return apiRequest("PATCH", "/api/sdr/preferences", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sdr/preferences"] });
      setHasChanges(false);
      toast({ title: "Preferences saved", description: "Your sending preferences have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    }
  });

  const handleChange = <K extends keyof SendingPreferences>(key: K, value: SendingPreferences[K]) => {
    if (formData) {
      setFormData({ ...formData, [key]: value });
      setHasChanges(true);
    }
  };

  const handleSave = () => {
    if (formData) {
      mutation.mutate(formData);
    }
  };

  if (isLoading || !formData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sending Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-sending-preferences">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Sending Preferences
            </CardTitle>
            <CardDescription>
              Configure your default email sending settings
            </CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={mutation.isPending} data-testid="button-save-preferences">
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Send Window</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Select
                  value={formData.sendWindowStart.toString()}
                  onValueChange={(v) => handleChange("sendWindowStart", parseInt(v))}
                >
                  <SelectTrigger id="start-time" data-testid="select-start-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time</Label>
                <Select
                  value={formData.sendWindowEnd.toString()}
                  onValueChange={(v) => handleChange("sendWindowEnd", parseInt(v))}
                >
                  <SelectTrigger id="end-time" data-testid="select-end-time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map((h) => (
                      <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(v) => handleChange("timezone", v)}
              >
                <SelectTrigger id="timezone" data-testid="select-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <Label htmlFor="exclude-weekends">Exclude Weekends</Label>
                <p className="text-sm text-muted-foreground">Don't send emails on Saturday/Sunday</p>
              </div>
              <Switch
                id="exclude-weekends"
                checked={formData.excludeWeekends}
                onCheckedChange={(v) => handleChange("excludeWeekends", v)}
                data-testid="switch-exclude-weekends"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Email Style</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Default Tone</Label>
              <Select
                value={formData.defaultTone}
                onValueChange={(v) => handleChange("defaultTone", v as SendingPreferences['defaultTone'])}
              >
                <SelectTrigger id="tone" data-testid="select-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <span>{t.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">- {t.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signature">Default Signature</Label>
              <Textarea
                id="signature"
                placeholder="Enter your email signature..."
                value={formData.defaultSignature}
                onChange={(e) => handleChange("defaultSignature", e.target.value)}
                rows={4}
                data-testid="textarea-signature"
              />
              <p className="text-xs text-muted-foreground">
                This signature will be appended to all outgoing emails unless overridden
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
