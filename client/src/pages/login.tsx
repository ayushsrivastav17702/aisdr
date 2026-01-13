import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, KeyRound, ChevronDown, ChevronUp, Users, Search, Mail, BarChart3, Shield, Building2, Zap } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  const hasOAuthOptions = authConfig?.googleEnabled || authConfig?.microsoftEnabled;

  const features = [
    {
      icon: Search,
      title: 'AI-Powered Search',
      description: 'Natural language queries to find your ideal prospects'
    },
    {
      icon: Mail,
      title: 'Smart Sequences',
      description: 'Automated multi-step email campaigns with personalization'
    },
    {
      icon: BarChart3,
      title: 'Real-Time Analytics',
      description: 'Track opens, replies, and engagement metrics'
    },
  ];

  const trustSignals = [
    { icon: Shield, label: 'Enterprise Security' },
    { icon: Building2, label: 'Multi-Tenant' },
    { icon: Zap, label: 'SSO Ready' },
  ];

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Left Panel - Value Proposition */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
        </div>
        
        {/* Gradient Orbs */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          {/* Logo and Brand */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
              <span className="text-xl font-bold text-white">AI</span>
            </div>
            <span className="text-2xl font-bold text-white">AiSDR</span>
          </div>

          {/* Main Value Proposition */}
          <div className="max-w-xl">
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
              AI-Powered Outbound for Modern Sales Teams
            </h1>
            <p className="text-xl text-slate-300 mb-12 leading-relaxed">
              Search, personalize, sequence, and track replies — all in one intelligent platform built for SDRs, Managers, and Revenue Leaders.
            </p>

            {/* Feature Highlights */}
            <div className="space-y-6">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-4 group">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">{feature.title}</h3>
                    <p className="text-slate-400 text-sm">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trust Signals */}
        <div className="relative z-10">
          <div className="flex items-center gap-8 pt-8 border-t border-white/10">
            {trustSignals.map((signal, index) => (
              <div key={index} className="flex items-center gap-2 text-slate-400">
                <signal.icon className="w-4 h-4" />
                <span className="text-sm">{signal.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-8 bg-white dark:bg-slate-950">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-xl font-bold text-white">AI</span>
            </div>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">AiSDR</span>
          </div>

          <Card className="border-0 shadow-xl dark:bg-slate-900/50 dark:border dark:border-slate-800">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
              <CardDescription className="text-center">
                Sign in to access your sales dashboard
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
                      Multiple accounts found. Please select which account to use.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-2">
                    {multipleAccounts.map((account, index) => (
                      <Button
                        key={account.id}
                        type="button"
                        variant="outline"
                        className="w-full h-12 justify-start"
                        onClick={() => handleAccountSelect(account.id)}
                        disabled={isSubmitting}
                        data-testid={`button-select-account-${index}`}
                      >
                        <Users className="mr-3 h-5 w-5" />
                        <span className="flex flex-col items-start">
                          <span className="text-sm font-medium">Account {index + 1}</span>
                          <span className="text-xs text-muted-foreground">
                            {account.organizationId ? `Org: ${account.organizationId.slice(0, 8)}...` : 'Personal account'}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={handleBackToLogin}
                    data-testid="button-back-to-login"
                  >
                    Back to login
                  </Button>
                </div>
              )}

              {!multipleAccounts && hasOAuthOptions && (
                <div className="space-y-3">
                  {authConfig?.googleEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 font-medium"
                      onClick={handleGoogleLogin}
                      disabled={isSubmitting}
                      data-testid="button-google-login"
                    >
                      <SiGoogle className="mr-3 h-5 w-5 text-red-500" />
                      Continue with Google
                    </Button>
                  )}

                  {authConfig?.microsoftEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 font-medium"
                      onClick={handleMicrosoftLogin}
                      disabled={isSubmitting}
                      data-testid="button-microsoft-login"
                    >
                      <BsMicrosoft className="mr-3 h-5 w-5 text-blue-500" />
                      Continue with Microsoft
                    </Button>
                  )}
                </div>
              )}

              {!multipleAccounts && authConfig?.passwordLoginEnabled && (
                <>
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <Separator className="w-full" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white dark:bg-slate-900 px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  {!showPasswordLogin ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPasswordLogin(true)}
                      data-testid="button-show-password-login"
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Sign in with email
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
                          <PasswordInput
                            id="password"
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
                          className="w-full h-11"
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

              {/* Mobile Trust Signals */}
              <div className="lg:hidden pt-6 mt-4 border-t">
                <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                  {trustSignals.map((signal, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <signal.icon className="w-3 h-3" />
                      <span>{signal.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer - Help Text */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Need access?{' '}
            <span className="text-slate-600 dark:text-slate-400">
              Ask your organization admin for an invite
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
