import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Mail, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);

  if (!user || user.emailVerified) {
    return null;
  }

  const handleResendEmail = async () => {
    try {
      setIsResending(true);
      const response = await apiRequest('POST', '/api/auth/resend-verification-email', {
        email: user.email,
      });

      if (!response.ok) {
        const data = await response.json();
        toast({
          title: 'Error',
          description: data.error || 'Failed to send verification email. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Verification email sent',
        description: 'Check your inbox for the verification link.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send verification email. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Alert className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950 dark:border-amber-700" data-testid="alert-email-verification">
      <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-900 dark:text-amber-100">Email Verification Required</AlertTitle>
      <AlertDescription className="flex items-center justify-between text-amber-800 dark:text-amber-200">
        <span className="flex-1">
          Please verify your email address to access all features. Check your inbox for the verification link.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResendEmail}
          disabled={isResending}
          className="ml-4 border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-300 dark:hover:bg-amber-900"
          data-testid="button-resend-verification"
        >
          {isResending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              Resend Email
            </>
          )}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
