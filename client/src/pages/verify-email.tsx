import { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    
    if (!tokenParam) {
      setVerificationStatus('error');
      setMessage('No verification token provided');
      setIsValidating(false);
      return;
    }

    setToken(tokenParam);
    validateToken(tokenParam);
  }, []);

  const validateToken = async (tokenValue: string) => {
    try {
      setIsValidating(true);
      const response = await fetch(`/api/auth/validate-verification-token?token=${tokenValue}`);
      
      if (!response.ok) {
        const data = await response.json();
        setVerificationStatus('error');
        setMessage(data.error || 'Invalid or expired verification link');
        setIsValidating(false);
        return;
      }
      
      const data = await response.json();
      if (data.valid) {
        // Token is valid, stop showing validation spinner and proceed to verify
        setIsValidating(false);
        verifyEmail(tokenValue);
      } else {
        setVerificationStatus('error');
        setMessage('Invalid or expired verification link');
        setIsValidating(false);
      }
    } catch (error) {
      setVerificationStatus('error');
      setMessage('Failed to validate verification link');
      setIsValidating(false);
    }
  };

  const verifyEmail = async (tokenValue: string) => {
    try {
      setIsVerifying(true);
      const response = await fetch(`/api/auth/verify-email?token=${tokenValue}`);
      
      if (!response.ok) {
        const data = await response.json();
        setVerificationStatus('error');
        setMessage(data.error || 'Email verification failed');
        setIsVerifying(false);
        return;
      }
      
      const data = await response.json();
      setVerificationStatus('success');
      setMessage('Your email has been verified successfully!');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        setLocation('/login');
      }, 3000);
    } catch (error) {
      setVerificationStatus('error');
      setMessage('Failed to verify email');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 flex flex-col items-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="text-center text-muted-foreground">Validating your verification link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              verificationStatus === 'success' ? 'bg-green-500' : 
              verificationStatus === 'error' ? 'bg-red-500' : 
              'bg-primary'
            }`}>
              {verificationStatus === 'success' && <CheckCircle2 className="w-6 h-6 text-white" />}
              {verificationStatus === 'error' && <XCircle className="w-6 h-6 text-white" />}
              {verificationStatus === 'pending' && <Mail className="w-6 h-6 text-primary-foreground" />}
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center">
            {verificationStatus === 'success' && 'Email Verified!'}
            {verificationStatus === 'error' && 'Verification Failed'}
            {verificationStatus === 'pending' && 'Verifying Email'}
          </CardTitle>
          <CardDescription className="text-center">
            {verificationStatus === 'success' && 'You will be redirected to login shortly'}
            {verificationStatus === 'error' && 'There was a problem verifying your email'}
            {verificationStatus === 'pending' && 'Please wait while we verify your email'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isVerifying && (
            <div className="flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Verifying...</span>
            </div>
          )}

          {message && (
            <Alert variant={verificationStatus === 'error' ? 'destructive' : 'default'} data-testid="alert-verification-message">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {verificationStatus === 'success' && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Redirecting to login page in 3 seconds...
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full" data-testid="button-go-to-login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go to Login Now
                </Button>
              </Link>
            </div>
          )}

          {verificationStatus === 'error' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Your verification link may have expired or is invalid.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full" data-testid="button-back-to-login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
