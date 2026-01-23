import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ChevronDown, ChevronUp, Users, Mail, Lock } from 'lucide-react';
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
  const [rememberMe, setRememberMe] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-[#0176D3]" />
      </div>
    );
  }

  const hasOAuthOptions = authConfig?.googleEnabled || authConfig?.microsoftEnabled;

  return (
    <div className="min-h-screen flex">
      {/* Left Column - Login Panel */}
      <div className="w-full lg:w-[480px] xl:w-[520px] flex flex-col justify-center bg-white px-8 sm:px-12 lg:px-16 py-12 relative">
        {/* Login Card */}
        <div className="w-full max-w-[400px] mx-auto">
          {/* Logo */}
          <div className="mb-10">
            <div className="flex items-center gap-3">
              <div 
                className="w-11 h-11 flex items-center justify-center rounded-lg"
                style={{ backgroundColor: '#0176D3' }}
              >
                <span className="text-lg font-bold text-white tracking-tight">AI</span>
              </div>
              <span className="text-2xl font-semibold text-gray-900 tracking-tight">AiSDR</span>
            </div>
          </div>

          {/* Welcome Text */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Log in to your account
            </h1>
            <p className="text-gray-500 text-sm">
              Welcome back! Please enter your credentials.
            </p>
          </div>

          {/* Error/Success Alerts */}
          {error && (
            <Alert variant="destructive" className="mb-6 border-red-200 bg-red-50" data-testid="alert-login-error">
              <AlertDescription className="text-sm text-red-700">{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="mb-6 border-green-200 bg-green-50" data-testid="alert-success">
              <AlertDescription className="text-sm text-green-700">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Account Selection */}
          {multipleAccounts && (
            <div className="space-y-4" data-testid="account-selection">
              <p className="text-sm text-gray-600 mb-4">
                Multiple accounts found. Select one to continue.
              </p>
              <div className="space-y-3">
                {multipleAccounts.map((account, index) => (
                  <button
                    key={account.id}
                    type="button"
                    className="w-full h-14 px-4 flex items-center border-2 border-gray-200 rounded-lg hover:border-[#0176D3] hover:bg-blue-50 transition-all"
                    onClick={() => handleAccountSelect(account.id)}
                    disabled={isSubmitting}
                    data-testid={`button-select-account-${index}`}
                  >
                    <Users className="mr-3 h-5 w-5 text-gray-400" />
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
                className="w-full text-sm text-[#0176D3] hover:text-[#015ba8] font-medium mt-4"
                onClick={handleBackToLogin}
                data-testid="button-back-to-login"
              >
                Back to login
              </button>
            </div>
          )}

          {/* OAuth Options */}
          {!multipleAccounts && hasOAuthOptions && (
            <div className="space-y-3 mb-6">
              {authConfig?.googleEnabled && (
                <button
                  type="button"
                  className="w-full h-12 px-4 flex items-center justify-center gap-3 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting}
                  data-testid="button-google-login"
                >
                  <SiGoogle className="h-4 w-4" />
                  Continue with Google
                </button>
              )}

              {authConfig?.microsoftEnabled && (
                <button
                  type="button"
                  className="w-full h-12 px-4 flex items-center justify-center gap-3 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
                  onClick={handleMicrosoftLogin}
                  disabled={isSubmitting}
                  data-testid="button-microsoft-login"
                >
                  <BsMicrosoft className="h-4 w-4" />
                  Continue with Microsoft
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
                <span className="bg-white px-4 text-gray-400 uppercase tracking-wider font-medium">or</span>
              </div>
            </div>
          )}

          {/* Email/Password Login */}
          {!multipleAccounts && authConfig?.passwordLoginEnabled && (
            <>
              {!showPasswordLogin ? (
                <button
                  type="button"
                  className="w-full h-12 px-4 flex items-center justify-center gap-2 border-2 border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
                  onClick={() => setShowPasswordLogin(true)}
                  data-testid="button-show-password-login"
                >
                  <Mail className="h-4 w-4" />
                  Log In with Email
                  <ChevronDown className="h-4 w-4 ml-1" />
                </button>
              ) : (
                <form onSubmit={handlePasswordLogin} className="space-y-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Email login</span>
                    <button
                      type="button"
                      className="text-xs text-gray-400 hover:text-gray-600 p-1"
                      onClick={() => setShowPasswordLogin(false)}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Email Input */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        id="email"
                        type="email"
                        className="w-full h-12 pl-10 pr-4 border-2 border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0176D3] focus:border-transparent transition-all"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isSubmitting}
                        data-testid="input-email"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        id="password"
                        type="password"
                        className="w-full h-12 pl-10 pr-4 border-2 border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0176D3] focus:border-transparent transition-all"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isSubmitting}
                        data-testid="input-password"
                      />
                    </div>
                  </div>

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-[#0176D3] border-2 border-gray-300 rounded focus:ring-[#0176D3] focus:ring-offset-0"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        data-testid="checkbox-remember-me"
                      />
                      <span className="ml-2 text-sm text-gray-600">Remember me</span>
                    </label>
                    <a
                      href="#"
                      className="text-sm text-[#0176D3] hover:text-[#015ba8] font-medium"
                      onClick={(e) => e.preventDefault()}
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </a>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full h-12 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
                    style={{ 
                      backgroundColor: '#0176D3',
                    }}
                    onMouseOver={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#015ba8')}
                    onMouseOut={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#0176D3')}
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

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              © 2026 AiSDR. All rights reserved.
            </p>
            <div className="flex items-center justify-center gap-4 mt-2">
              <a href="#" className="text-xs text-gray-400 hover:text-gray-600">Privacy Policy</a>
              <span className="text-gray-300">|</span>
              <a href="#" className="text-xs text-gray-400 hover:text-gray-600">Terms of Service</a>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Marketing Panel (Hidden on mobile) */}
      <div 
        className="hidden lg:flex flex-1 flex-col justify-center items-center p-12 xl:p-16 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0176D3 0%, #032D60 50%, #001639 100%)',
        }}
      >
        {/* Background Pattern */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-lg text-center lg:text-left">
          {/* Headline */}
          <h2 className="text-3xl xl:text-4xl font-bold text-white mb-6 leading-tight">
            Automate Your Sales Outreach with AI
          </h2>
          
          {/* Description */}
          <p className="text-lg text-blue-100 mb-8 leading-relaxed">
            Discover prospects, enrich data, and send personalized emails at scale. 
            Our AI-powered SDR platform helps you connect with the right people, faster.
          </p>

          {/* Feature List */}
          <div className="space-y-4 mb-10">
            <div className="flex items-center gap-3 text-white">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-medium">AI-Powered Prospect Discovery</span>
            </div>
            <div className="flex items-center gap-3 text-white">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-medium">Automated Multi-Channel Sequences</span>
            </div>
            <div className="flex items-center gap-3 text-white">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-medium">Intelligent Reply Detection</span>
            </div>
            <div className="flex items-center gap-3 text-white">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm font-medium">Enterprise-Grade Security</span>
            </div>
          </div>

          {/* CTA Button (non-functional, UI only) */}
          <button
            type="button"
            className="inline-flex items-center px-6 py-3 border-2 border-white text-white text-sm font-semibold rounded-lg hover:bg-white hover:text-[#0176D3] transition-all"
            onClick={(e) => e.preventDefault()}
            data-testid="button-learn-more"
          >
            Learn More
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>

        {/* Decorative Elements */}
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mb-32" />
        <div className="absolute top-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mt-24" />
      </div>
    </div>
  );
}
