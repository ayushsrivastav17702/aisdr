import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Mail, KeyRound, ChevronDown, ChevronUp } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { BsMicrosoft } from 'react-icons/bs';
import { useQuery } from '@tanstack/react-query';

interface AuthConfig {
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  magicLinkEnabled: boolean;
  passwordLoginEnabled: boolean;
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const { data: authConfig, isLoading: configLoading } = useQuery<AuthConfig>({
    queryKey: ['/api/auth/config'],
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const errorParam = params.get('error');
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        google_denied: 'Google login was cancelled',
        microsoft_denied: 'Microsoft login was cancelled',
        no_code: 'Authentication failed - no authorization code received',
        google_failed: 'Google authentication failed',
        microsoft_failed: 'Microsoft authentication failed',
      };
      setError(decodeURIComponent(errorMessages[errorParam] || errorParam));
    }
  }, [searchString]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Make direct API call to handle both super admin and regular user login
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Check if this is a super admin login
      if (data.userType === 'super_admin') {
        // Store super admin info in session storage for the super admin dashboard
        sessionStorage.setItem('super_admin', JSON.stringify(data.superAdmin));
        setLocation(data.redirectTo || '/super-admin');
        return;
      }

      // Regular user login - store token and let auth context refresh
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
        // Force page reload to let auth context pick up the new token
        window.location.href = data.redirectTo || '/';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMagicLinkRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send magic link');
        return;
      }

      setMagicLinkSent(true);
      setSuccessMessage('Magic link sent! Please check your inbox.');
    } catch (err) {
      setError('Failed to send magic link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const handleMicrosoftLogin = () => {
    window.location.href = '/api/auth/microsoft';
  };

  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const hasOAuthOptions = authConfig?.googleEnabled || authConfig?.microsoftEnabled;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold text-primary-foreground">AI</span>
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-center">Welcome to AiSDR</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive" data-testid="alert-login-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert data-testid="alert-success">
              <AlertDescription className="text-green-700 dark:text-green-400">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {hasOAuthOptions && (
            <div className="space-y-3">
              {authConfig?.googleEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting}
                  data-testid="button-google-login"
                >
                  <SiGoogle className="mr-3 h-5 w-5 text-red-500" />
                  Sign in with Google
                </Button>
              )}

              {authConfig?.microsoftEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12"
                  onClick={handleMicrosoftLogin}
                  disabled={isSubmitting}
                  data-testid="button-microsoft-login"
                >
                  <BsMicrosoft className="mr-3 h-5 w-5 text-blue-500" />
                  Sign in with Microsoft
                </Button>
              )}
            </div>
          )}

          {authConfig?.magicLinkEnabled && (
            <>
              {hasOAuthOptions && (
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
              )}

              {!showMagicLink ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12"
                  onClick={() => setShowMagicLink(true)}
                  disabled={isSubmitting}
                  data-testid="button-show-magic-link"
                >
                  <Mail className="mr-3 h-5 w-5" />
                  Login with Magic Link
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Magic Link Login
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowMagicLink(false);
                        setMagicLinkSent(false);
                        setSuccessMessage('');
                      }}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </div>

                  {!magicLinkSent ? (
                    <form onSubmit={handleMagicLinkRequest} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="magic-email">Email address</Label>
                        <Input
                          id="magic-email"
                          type="email"
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          disabled={isSubmitting}
                          data-testid="input-magic-email"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={isSubmitting || !email}
                        data-testid="button-send-magic-link"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          'Send Magic Link'
                        )}
                      </Button>
                    </form>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">
                        Check your inbox for the magic link. It will expire in 15 minutes.
                      </p>
                      <Button
                        type="button"
                        variant="link"
                        className="mt-2"
                        onClick={() => {
                          setMagicLinkSent(false);
                          setSuccessMessage('');
                        }}
                        data-testid="button-resend-magic-link"
                      >
                        Send another link
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {authConfig?.passwordLoginEnabled && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              {!showPasswordLogin ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setShowPasswordLogin(true)}
                  data-testid="button-show-password-login"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Log in with email
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <KeyRound className="h-4 w-4" />
                      Email & Password
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPasswordLogin(false)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </div>

                  <form onSubmit={handlePasswordLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isSubmitting}
                        data-testid="input-email"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isSubmitting}
                        data-testid="input-password"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting}
                      data-testid="button-login"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        'Sign in'
                      )}
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}

          <div className="mt-6 pt-4 border-t text-center text-sm text-muted-foreground">
            <p>
              Don't have an account?{' '}
              <a href="mailto:support@aisdr.com" className="text-primary hover:underline">
                Contact support
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
