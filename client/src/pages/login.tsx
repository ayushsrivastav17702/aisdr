import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8FAFC' }}>
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const hasOAuthOptions = authConfig?.googleEnabled || authConfig?.microsoftEnabled;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Login Card - Anchored, with physical presence */}
      <div 
        className="w-full max-w-[400px]"
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
        }}
      >
        {/* Logo Header */}
        <div className="px-10 pt-10 pb-6 border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex items-center justify-center gap-3">
            <div 
              className="w-12 h-12 flex items-center justify-center"
              style={{ 
                backgroundColor: '#0176D3', 
                borderRadius: '6px' 
              }}
            >
              <span className="text-xl font-bold text-white tracking-tight">AI</span>
            </div>
            <span className="text-2xl font-bold tracking-tight" style={{ color: '#111827' }}>AiSDR</span>
          </div>
          <p className="text-center text-sm mt-3" style={{ color: '#6B7280' }}>
            Enterprise outbound system
          </p>
        </div>

        {/* Login Form */}
        <div className="px-10 py-8">
          <h1 className="text-base font-medium text-center mb-6" style={{ color: '#374151' }}>
            Log in to your account
          </h1>

          {error && (
            <Alert variant="destructive" className="mb-5" data-testid="alert-login-error">
              <AlertDescription className="text-sm">{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="mb-5" data-testid="alert-success">
              <AlertDescription className="text-sm text-green-700">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Account Selection */}
          {multipleAccounts && (
            <div className="space-y-3" data-testid="account-selection">
              <p className="text-sm text-gray-600 mb-4">
                Multiple accounts found. Select one to continue.
              </p>
              <div className="space-y-2">
                {multipleAccounts.map((account, index) => (
                  <button
                    key={account.id}
                    type="button"
                    className="w-full h-12 px-4 flex items-center border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                    style={{ borderRadius: '4px' }}
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
                className="w-full text-sm text-gray-600 hover:text-gray-900 mt-3"
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
                  className="w-full h-11 px-4 flex items-center justify-center gap-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  style={{ borderRadius: '4px' }}
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
                  className="w-full h-11 px-4 flex items-center justify-center gap-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  style={{ borderRadius: '4px' }}
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
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-gray-400 uppercase tracking-wide">or</span>
              </div>
            </div>
          )}

          {/* Email/Password Login */}
          {!multipleAccounts && authConfig?.passwordLoginEnabled && (
            <>
              {!showPasswordLogin ? (
                <button
                  type="button"
                  className="w-full h-11 px-4 flex items-center justify-center gap-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  style={{ borderRadius: '4px' }}
                  onClick={() => setShowPasswordLogin(true)}
                  data-testid="button-show-password-login"
                >
                  Log In with Email
                  <ChevronDown className="h-4 w-4" />
                </button>
              ) : (
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Email login</span>
                    <button
                      type="button"
                      className="text-xs text-gray-500 hover:text-gray-700"
                      onClick={() => setShowPasswordLogin(false)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm text-gray-600 mb-1.5">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      className="w-full h-10 px-3 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      style={{ borderRadius: '4px' }}
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                      data-testid="input-email"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm text-gray-600 mb-1.5">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      className="w-full h-10 px-3 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      style={{ borderRadius: '4px' }}
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
                    className="w-full h-11 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{ 
                      backgroundColor: '#0176D3',
                      borderRadius: '4px',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#015ba8'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#0176D3'}
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

        {/* Trust Footer - Inside card */}
        <div className="px-10 pb-6">
          <p className="text-xs text-gray-400 text-center">
            SOC2-ready · Encrypted · Role-based access
          </p>
        </div>
      </div>

      {/* Access Info */}
      <p className="mt-6 text-xs text-gray-400 text-center">
        Access is managed by your organization administrator
      </p>
    </div>
  );
}
