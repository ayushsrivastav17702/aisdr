import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, KeyRound, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { BsMicrosoft } from 'react-icons/bs';
import { useQuery } from '@tanstack/react-query';

interface AuthConfig {
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  magicLinkEnabled: boolean;
  passwordLoginEnabled: boolean;
}

interface AccountOption {
  id: string;
  organizationId: string | null;
  createdBy: string | null;
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordLogin, setShowPasswordLogin] = useState(false);
  const [multipleAccounts, setMultipleAccounts] = useState<AccountOption[] | null>(null);

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

  const handlePasswordLogin = async (e: React.FormEvent, userId?: string) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, userId }),
      });

      const data = await response.json();

      if (response.status === 300 && data.multipleAccounts) {
        setMultipleAccounts(data.accounts);
        setIsSubmitting(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.userType === 'super_admin') {
        sessionStorage.setItem('super_admin', JSON.stringify(data.superAdmin));
        setLocation(data.redirectTo || '/super-admin');
        return;
      }

      if (data.token) {
        localStorage.setItem('auth_token', data.token);
        window.location.href = data.redirectTo || '/';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccountSelect = async (accountId: string) => {
    const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
    await handlePasswordLogin(syntheticEvent, accountId);
  };

  const handleBackToLogin = () => {
    setMultipleAccounts(null);
    setPassword('');
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const handleMicrosoftLogin = () => {
    window.location.href = '/api/auth/microsoft';
  };

  if (configLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const hasOAuthOptions = authConfig?.googleEnabled || authConfig?.microsoftEnabled;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      {/* Logo */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-slate-900 dark:bg-white rounded-lg flex items-center justify-center">
            <span className="text-sm font-semibold text-white dark:text-slate-900">AI</span>
          </div>
          <span className="text-xl font-semibold text-slate-900 dark:text-white">AiSDR</span>
        </div>
      </div>

      {/* Login Card */}
      <Card className="w-full max-w-sm border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-xl font-semibold text-center text-slate-900 dark:text-white">
            Welcome back
          </CardTitle>
          <CardDescription className="text-center text-slate-500 dark:text-slate-400">
            Secure outbound platform for revenue teams
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

          {/* Account Selection UI */}
          {multipleAccounts && (
            <div className="space-y-4" data-testid="account-selection">
              <Alert>
                <Users className="h-4 w-4" />
                <AlertDescription>
                  Multiple accounts found. Select one to continue.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                {multipleAccounts.map((account, index) => (
                  <Button
                    key={account.id}
                    type="button"
                    variant="outline"
                    className="w-full h-11 justify-start text-sm"
                    onClick={() => handleAccountSelect(account.id)}
                    disabled={isSubmitting}
                    data-testid={`button-select-account-${index}`}
                  >
                    <Users className="mr-3 h-4 w-4 text-slate-400" />
                    <span className="flex flex-col items-start">
                      <span className="font-medium">Account {index + 1}</span>
                      <span className="text-xs text-slate-500">
                        {account.organizationId ? `Org: ${account.organizationId.slice(0, 8)}...` : 'Personal'}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={handleBackToLogin}
                data-testid="button-back-to-login"
              >
                Back
              </Button>
            </div>
          )}

          {/* OAuth Options */}
          {!multipleAccounts && hasOAuthOptions && (
            <div className="space-y-2">
              {authConfig?.googleEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 text-sm font-normal"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting}
                  data-testid="button-google-login"
                >
                  <SiGoogle className="mr-2 h-4 w-4" />
                  Continue with Google
                </Button>
              )}

              {authConfig?.microsoftEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 text-sm font-normal"
                  onClick={handleMicrosoftLogin}
                  disabled={isSubmitting}
                  data-testid="button-microsoft-login"
                >
                  <BsMicrosoft className="mr-2 h-4 w-4" />
                  Continue with Microsoft
                </Button>
              )}
            </div>
          )}

          {/* Email/Password Login */}
          {!multipleAccounts && authConfig?.passwordLoginEnabled && (
            <>
              {hasOAuthOptions && (
                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white dark:bg-slate-950 px-2 text-slate-400">or</span>
                  </div>
                </div>
              )}

              {!showPasswordLogin ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 text-sm font-normal text-slate-600 dark:text-slate-300"
                  onClick={() => setShowPasswordLogin(true)}
                  data-testid="button-show-password-login"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Continue with email
                  <ChevronDown className="ml-auto h-4 w-4" />
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Email login</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => setShowPasswordLogin(false)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </div>

                  <form onSubmit={handlePasswordLogin} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-sm text-slate-600 dark:text-slate-400">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isSubmitting}
                        className="h-9"
                        data-testid="input-email"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="password" className="text-sm text-slate-600 dark:text-slate-400">Password</Label>
                      <PasswordInput
                        id="password"
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isSubmitting}
                        className="h-9"
                        data-testid="input-password"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-9"
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
        </CardContent>
      </Card>

      {/* Trust Signals - Subtle text only */}
      <p className="mt-6 text-xs text-slate-400 dark:text-slate-500 text-center">
        SOC2-aligned · Multi-tenant · Role-based access · SSO ready
      </p>

      {/* Access Info */}
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 text-center">
        Access is managed by your organization administrator
      </p>
    </div>
  );
}
