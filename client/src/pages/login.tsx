import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, ChevronDown, ChevronUp, Users } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const hasOAuthOptions = authConfig?.googleEnabled || authConfig?.microsoftEnabled;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#ffffff' }}>
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Logo */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2">
            <div className="w-10 h-10 bg-[#0176D3] rounded flex items-center justify-center">
              <span className="text-base font-bold text-white">AI</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">AiSDR</span>
          </div>
        </div>

        {/* Login Box */}
        <div className="w-full max-w-[360px]">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
            <h1 className="text-xl font-normal text-gray-900 text-center mb-6">
              Log in to your account
            </h1>

            {error && (
              <Alert variant="destructive" className="mb-4" data-testid="alert-login-error">
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert className="mb-4" data-testid="alert-success">
                <AlertDescription className="text-sm text-green-700">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}

            {/* Account Selection */}
            {multipleAccounts && (
              <div className="space-y-3" data-testid="account-selection">
                <p className="text-sm text-gray-600 mb-3">
                  Multiple accounts found. Select one to continue.
                </p>
                <div className="space-y-2">
                  {multipleAccounts.map((account, index) => (
                    <button
                      key={account.id}
                      type="button"
                      className="w-full h-11 px-4 flex items-center border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      onClick={() => handleAccountSelect(account.id)}
                      disabled={isSubmitting}
                      data-testid={`button-select-account-${index}`}
                    >
                      <Users className="mr-3 h-4 w-4 text-gray-400" />
                      <span className="flex flex-col items-start text-sm">
                        <span className="font-medium text-gray-900">Account {index + 1}</span>
                        <span className="text-xs text-gray-500">
                          {account.organizationId ? `Org: ${account.organizationId.slice(0, 8)}...` : 'Personal'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="w-full text-sm text-[#0176D3] hover:underline mt-2"
                  onClick={handleBackToLogin}
                  data-testid="button-back-to-login"
                >
                  Back to login
                </button>
              </div>
            )}

            {/* OAuth Options */}
            {!multipleAccounts && hasOAuthOptions && (
              <div className="space-y-3">
                {authConfig?.googleEnabled && (
                  <button
                    type="button"
                    className="w-full h-10 px-4 flex items-center justify-center gap-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={handleGoogleLogin}
                    disabled={isSubmitting}
                    data-testid="button-google-login"
                  >
                    <SiGoogle className="h-4 w-4" />
                    Log In with Google
                  </button>
                )}

                {authConfig?.microsoftEnabled && (
                  <button
                    type="button"
                    className="w-full h-10 px-4 flex items-center justify-center gap-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={handleMicrosoftLogin}
                    disabled={isSubmitting}
                    data-testid="button-microsoft-login"
                  >
                    <BsMicrosoft className="h-4 w-4" />
                    Log In with Microsoft
                  </button>
                )}
              </div>
            )}

            {/* Divider */}
            {!multipleAccounts && authConfig?.passwordLoginEnabled && hasOAuthOptions && (
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-gray-500">OR</span>
                </div>
              </div>
            )}

            {/* Email/Password Login */}
            {!multipleAccounts && authConfig?.passwordLoginEnabled && (
              <>
                {!showPasswordLogin ? (
                  <button
                    type="button"
                    className="w-full h-10 px-4 flex items-center justify-center gap-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setShowPasswordLogin(true)}
                    data-testid="button-show-password-login"
                  >
                    Log In with Email
                    <ChevronDown className="h-4 w-4" />
                  </button>
                ) : (
                  <form onSubmit={handlePasswordLogin} className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Email login</span>
                      <button
                        type="button"
                        className="text-xs text-[#0176D3] hover:underline"
                        onClick={() => setShowPasswordLogin(false)}
                      >
                        Hide
                      </button>
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        className="w-full h-9 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0176D3] focus:border-transparent"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isSubmitting}
                        data-testid="input-email"
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-sm text-gray-700 mb-1">
                        Password
                      </label>
                      <input
                        id="password"
                        type="password"
                        className="w-full h-9 px-3 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0176D3] focus:border-transparent"
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isSubmitting}
                        data-testid="input-password"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full h-10 bg-[#0176D3] text-white rounded text-sm font-medium hover:bg-[#014486] transition-colors disabled:opacity-50"
                      disabled={isSubmitting}
                      data-testid="button-login"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Logging in...
                        </span>
                      ) : (
                        'Log In'
                      )}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          {/* Footer Links */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Access is managed by your organization administrator
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Multi-tenant · Role-based access · SSO ready
        </p>
      </div>
    </div>
  );
}
