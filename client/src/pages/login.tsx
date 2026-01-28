import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Users, Eye, EyeOff, UserPlus, MessageSquare, Shield, Zap } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { BsMicrosoft } from 'react-icons/bs';
import { useQuery } from '@tanstack/react-query';
import './login.css';

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
  const [multipleAccounts, setMultipleAccounts] = useState<AccountOption[] | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      <div className="login-loading">
        <Loader2 className="login-loading-spinner" />
      </div>
    );
  }

  const hasOAuthOptions = authConfig?.googleEnabled || authConfig?.microsoftEnabled;

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Left Side - Login Form */}
        <div className="login-form-section">
          <div className="logo">
            <div className="logo-icon">AI</div>
            <span className="logo-text">AiSDR</span>
          </div>

          <div className="welcome-text">
            <h1>Welcome back</h1>
            <p>Enter your credentials to access your account</p>
          </div>

          {/* Error/Success Alerts */}
          {error && (
            <Alert variant="destructive" className="login-alert login-alert-error" data-testid="alert-login-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="login-alert login-alert-success" data-testid="alert-success">
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Account Selection */}
          {multipleAccounts ? (
            <div className="login-form" data-testid="account-selection">
              <p className="account-selection-text">
                Multiple accounts found. Select one to continue.
              </p>
              <div className="account-list">
                {multipleAccounts.map((account, index) => (
                  <button
                    key={account.id}
                    type="button"
                    className="account-btn"
                    onClick={() => handleAccountSelect(account.id)}
                    disabled={isSubmitting}
                    data-testid={`button-select-account-${index}`}
                  >
                    <Users className="account-icon" />
                    <span className="account-info">
                      <span className="account-name">Account {index + 1}</span>
                      <span className="account-org">
                        {account.organizationId ? `Org: ${account.organizationId.slice(0, 8)}...` : 'Personal'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="back-to-login-btn"
                onClick={handleBackToLogin}
                data-testid="button-back-to-login"
              >
                Back to login
              </button>
            </div>
          ) : (
            <form className="login-form" onSubmit={handlePasswordLogin}>
              {/* Social Login */}
              {hasOAuthOptions && (
                <div className="social-login">
                  {authConfig?.googleEnabled && (
                    <button
                      type="button"
                      className="social-btn"
                      onClick={handleGoogleLogin}
                      disabled={isSubmitting}
                      data-testid="button-google-login"
                    >
                      <SiGoogle className="social-icon" />
                      Google
                    </button>
                  )}
                  {authConfig?.microsoftEnabled && (
                    <button
                      type="button"
                      className="social-btn"
                      onClick={handleMicrosoftLogin}
                      disabled={isSubmitting}
                      data-testid="button-microsoft-login"
                    >
                      <BsMicrosoft className="social-icon" />
                      Microsoft
                    </button>
                  )}
                </div>
              )}

              {/* Divider */}
              {hasOAuthOptions && authConfig?.passwordLoginEnabled && (
                <div className="divider">or continue with email</div>
              )}

              {/* Email/Password Form */}
              {authConfig?.passwordLoginEnabled && (
                <>
                  <div className="form-group">
                    <label htmlFor="email" className="form-label">Email address</label>
                    <input
                      type="email"
                      id="email"
                      className="form-input"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isSubmitting}
                      data-testid="input-email"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="password" className="form-label">Password</label>
                    <div className="input-wrapper">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        className="form-input"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isSubmitting}
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-footer">
                    <div className="checkbox-wrapper">
                      <input
                        type="checkbox"
                        id="remember"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        data-testid="checkbox-remember-me"
                      />
                      <label htmlFor="remember">Remember me</label>
                    </div>
                    <a
                      href="#"
                      className="forgot-link"
                      onClick={(e) => e.preventDefault()}
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </a>
                  </div>

                  <button
                    type="submit"
                    className="submit-btn"
                    disabled={isSubmitting}
                    data-testid="button-login"
                  >
                    {isSubmitting ? (
                      <span className="submit-btn-loading">
                        <Loader2 className="submit-spinner" />
                        Signing in...
                      </span>
                    ) : (
                      'Sign in to your account'
                    )}
                  </button>
                </>
              )}

              <div className="signup-link">
                Access is managed by your organization administrator
              </div>
            </form>
          )}
        </div>

        {/* Right Side - Hero Section */}
        <div className="hero-section">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="hero-badge-dot"></span>
              <span>ENTERPRISE SOLUTION</span>
            </div>
            
            <h2 className="hero-title">Automate Your Sales Outreach with AI</h2>
            
            <p className="hero-description">
              Discover prospects, enrich data, and send personalized emails at scale. 
              Our AI-powered SDR platform helps you connect with the right people, faster.
            </p>

            <ul className="features-list">
              <li className="feature-item">
                <div className="feature-icon">
                  <UserPlus size={20} />
                </div>
                <div className="feature-text">
                  <h3>AI-Powered Prospect Discovery</h3>
                  <p>Find ideal prospects with natural language search</p>
                </div>
              </li>
              <li className="feature-item">
                <div className="feature-icon">
                  <MessageSquare size={20} />
                </div>
                <div className="feature-text">
                  <h3>Smart Email Sequences</h3>
                  <p>Personalized multi-step campaigns that convert</p>
                </div>
              </li>
              <li className="feature-item">
                <div className="feature-icon">
                  <Zap size={20} />
                </div>
                <div className="feature-text">
                  <h3>Intelligent Reply Detection</h3>
                  <p>AI-powered sentiment analysis and intent detection</p>
                </div>
              </li>
              <li className="feature-item">
                <div className="feature-icon">
                  <Shield size={20} />
                </div>
                <div className="feature-text">
                  <h3>Enterprise Security</h3>
                  <p>SOC2-ready with role-based access control</p>
                </div>
              </li>
            </ul>

            <div className="trust-badges">
              <div className="trust-text">TRUSTED BY ENTERPRISE TEAMS</div>
              <div className="badge-grid">
                <div className="badge">SOC2 Ready</div>
                <div className="badge">Encrypted</div>
                <div className="badge">RBAC</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
