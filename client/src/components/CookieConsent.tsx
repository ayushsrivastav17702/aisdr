import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Cookie } from 'lucide-react';
import { Link } from 'wouter';

const CONSENT_KEY = 'cookie-consent';
const CONSENT_TIMESTAMP_KEY = 'cookie-consent-timestamp';
const CONSENT_EXPIRY_DAYS = 365;

type ConsentValue = 'accepted' | 'rejected' | null;

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [isEU, setIsEU] = useState(false);

  useEffect(() => {
    // Check if consent was already given
    const consent = localStorage.getItem(CONSENT_KEY) as ConsentValue;
    const timestamp = localStorage.getItem(CONSENT_TIMESTAMP_KEY);

    // Check if consent has expired (365 days)
    if (consent && timestamp) {
      const consentDate = new Date(parseInt(timestamp));
      const expiryDate = new Date(consentDate);
      expiryDate.setDate(expiryDate.getDate() + CONSENT_EXPIRY_DAYS);
      
      if (new Date() > expiryDate) {
        // Consent expired, clear it
        localStorage.removeItem(CONSENT_KEY);
        localStorage.removeItem(CONSENT_TIMESTAMP_KEY);
      } else {
        // Valid consent exists, don't show banner
        return;
      }
    }

    // Detect if user is likely from EU based on timezone
    // EU timezones: UTC-1 to UTC+3 (covers most of EU)
    // This is a simple heuristic - for production, use a geolocation API
    const detectEU = () => {
      const offset = new Date().getTimezoneOffset();
      const hourOffset = -offset / 60;
      
      // EU timezones roughly between UTC-1 and UTC+3
      // Also check for common EU timezone names
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const euTimezones = [
        'Europe/', 'GMT', 'UTC', 'WET', 'CET', 'EET',
        'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Madeira'
      ];
      
      const isEUTimezone = euTimezones.some(tz => timezone.includes(tz));
      const isEUOffset = hourOffset >= -1 && hourOffset <= 3;
      
      return isEUTimezone || isEUOffset;
    };

    const euDetected = detectEU();
    setIsEU(euDetected);

    // Show banner if no consent exists (especially for EU users)
    // For non-EU users, we can be less strict but still show for transparency
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    localStorage.setItem(CONSENT_TIMESTAMP_KEY, Date.now().toString());
    setShowBanner(false);
  };

  const handleReject = () => {
    localStorage.setItem(CONSENT_KEY, 'rejected');
    localStorage.setItem(CONSENT_TIMESTAMP_KEY, Date.now().toString());
    setShowBanner(false);
  };

  const handleClose = () => {
    // Closing without choosing = implicit rejection for EU users
    handleReject();
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-in slide-in-from-bottom duration-300"
      data-testid="cookie-consent-banner"
    >
      <Card className="max-w-4xl mx-auto p-6 shadow-lg border-2">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-1">
            <Cookie className="h-6 w-6 text-primary" />
          </div>
          
          <div className="flex-1 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg mb-2" data-testid="text-consent-title">
                  Cookie Preferences
                </h3>
                <p className="text-sm text-muted-foreground" data-testid="text-consent-description">
                  We use essential cookies to make our site work and optional cookies to improve your experience.
                  {isEU && " As an EU visitor, we respect your right to choose."}
                  {" "}
                  <Link href="/cookie-policy" className="text-primary hover:underline">
                    Learn more about our cookies
                  </Link>
                  {" and "}
                  <Link href="/privacy-policy" className="text-primary hover:underline">
                    privacy policy
                  </Link>
                  .
                </p>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="flex-shrink-0"
                data-testid="button-close-consent"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleAccept}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-accept-cookies"
              >
                Accept All Cookies
              </Button>
              
              <Button
                onClick={handleReject}
                variant="outline"
                data-testid="button-reject-cookies"
              >
                Reject Optional Cookies
              </Button>
              
              <Link href="/cookie-policy">
                <Button
                  variant="ghost"
                  data-testid="link-manage-cookies"
                >
                  Manage Preferences
                </Button>
              </Link>
            </div>

            {isEU && (
              <p className="text-xs text-muted-foreground mt-2">
                You can change your preferences anytime in your account settings or by clicking the cookie icon in the footer.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Helper function to check current consent status
export function getCookieConsent(): ConsentValue {
  const consent = localStorage.getItem(CONSENT_KEY) as ConsentValue;
  const timestamp = localStorage.getItem(CONSENT_TIMESTAMP_KEY);

  // Check if consent has expired
  if (consent && timestamp) {
    const consentDate = new Date(parseInt(timestamp));
    const expiryDate = new Date(consentDate);
    expiryDate.setDate(expiryDate.getDate() + CONSENT_EXPIRY_DAYS);
    
    if (new Date() > expiryDate) {
      // Expired consent is treated as no consent
      return null;
    }
  }

  return consent;
}

// Helper to check if analytics/tracking should be enabled
export function shouldEnableTracking(): boolean {
  return getCookieConsent() === 'accepted';
}
