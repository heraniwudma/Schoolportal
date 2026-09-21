import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Lock, User, ArrowRight, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { APP_NAME, APP_DESCRIPTION } from '../../config/branding';
import { OtpInput } from '../../components/ui/OtpInput';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const LoginPage = () => {
  const [idNumber, setIdNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetLoginId, setResetLoginId] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const { login, user } = useAuth();

  // Multi-step reset password states
  const [resetStep, setResetStep] = useState('email'); // 'email' | 'otp' | 'reset'
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!idNumber || !password) {
      const msg = 'Please fill in all fields';
      setLoginError(msg);
      toast.error(msg);
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(idNumber, password);
      if (result.success) {
        toast.success('Login successful!');
        navigate('/dashboard', { replace: true });
      } else {
        // Normalize any credential error to the exact requirement: "Invalid username or password."
        const isCredentialFailure =
          !result.error ||
          result.error === 'Invalid credentials' ||
          result.error === 'Unauthorized' ||
          result.error.toLowerCase().includes('credential') ||
          result.error.toLowerCase().includes('invalid username') ||
          result.error.toLowerCase().includes('invalid password') ||
          result.error.toLowerCase().includes('unauthorized');

        const message = isCredentialFailure
          ? 'Invalid username or password.'
          : result.error;

        setLoginError(message);
        toast.error(message);
      }
    } catch {
      const message = 'Invalid username or password.';
      setLoginError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Send OTP to Registered Email for Identified Account
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetLoginId.trim()) {
      toast.error('Please enter your Login ID or username.');
      return;
    }
    if (!resetEmail.trim()) {
      toast.error('Please enter your registered email address.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: resetLoginId.trim(),
          email: resetEmail.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Invalid Login ID or registered email address.');
      }

      toast.success(data.message || 'Verification code sent to your registered email!');
      setResetStep('otp'); // Move to OTP entry screen
    } catch (error: any) {
      toast.error(error.message || 'Failed to send verification code. Please check your details.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP and Obtain Single-Use Reset Authorization
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);

    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      const validationMsg = 'Please enter all 6 digits of the verification code.';
      setOtpError(validationMsg);
      toast.error(validationMsg);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: resetLoginId.trim(),
          email: resetEmail.trim(),
          otp: cleanOtp,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Invalid or expired verification code.');
      }

      if (data.resetToken) {
        setResetToken(data.resetToken);
      }
      toast.success(data.message || 'Verification code confirmed successfully!');
      setOtpError(null);
      setResetStep('reset'); // Move to New Password screen
    } catch (error: any) {
      const msg = error.message || 'Invalid or expired verification code.';
      setOtpError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Reset Password using Authorized Reset Token
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match!');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: resetLoginId.trim(),
          resetToken,
          otp: otpCode.trim(),
          newPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Failed to reset password.');
      }

      toast.success(data.message || 'Password reset successfully! You can now log in.');
      setShowForgotPassword(false);
      setResetStep('email'); // Reset state back to default
      setResetLoginId('');
      setResetEmail('');
      setResetToken('');
      setOtpCode('');
      setOtpError(null);
      setLoginError(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">
      <div className="absolute inset-0 bg-blue-900/40 backdrop-blur-sm"></div>
      
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl relative z-10 mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-900 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <GraduationCap className="text-white w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{APP_NAME}</h1>
          <p className="text-gray-500">{APP_DESCRIPTION}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {loginError && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-sm animate-in fade-in slide-in-from-top-1 duration-200"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <span className="font-medium">{loginError}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ID Number or Email</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={idNumber}
                onChange={(e) => {
                  setIdNumber(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="Enter your ID Number or Email"
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                placeholder="••••••••"
                className="w-full pl-10 pr-11 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button 
              type="button" 
              onClick={() => {
                setShowForgotPassword(true);
                setResetStep('email');
                setOtpCode('');
                setOtpError(null);
                if (idNumber.trim()) {
                  setResetLoginId(idNumber.trim());
                }
              }} 
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 group disabled:opacity-70"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                Sign In
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">Register now</Link>
          </p>
        </div>
      </div>
      <Toaster position="top-right" />

      {/* Multi-Step Password Reset Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
            
            {/* STEP 1: Enter Login ID & Registered Email */}
            {resetStep === 'email' && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Reset Password</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Enter your Login ID and the email address registered with your account.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Login ID / Username / ID Number
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={resetLoginId}
                      onChange={(e) => setResetLoginId(e.target.value)}
                      placeholder="e.g. STU-1001 or username"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Enter your registered email"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-2.5 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-800 transition-colors disabled:opacity-70 text-sm"
                  >
                    {isLoading ? 'Sending...' : 'Send OTP'}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: Enter OTP */}
            {resetStep === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Enter Verification Code</h2>
                  <p className="text-sm text-gray-500">
                    We've sent a 6-digit verification code to{' '}
                    <span className="font-semibold text-gray-800">{resetEmail}</span>
                  </p>
                </div>

                <div className="py-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 text-center">
                    6-Digit Verification Code
                  </label>
                  <OtpInput
                    value={otpCode}
                    onChange={(val) => {
                      setOtpCode(val);
                      if (otpError) setOtpError(null);
                    }}
                    hasError={Boolean(otpError)}
                    disabled={isLoading}
                    autoFocus
                  />
                  {otpError && (
                    <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-red-600 font-medium animate-in fade-in">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{otpError}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetStep('email');
                      setOtpError(null);
                    }}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-sm"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || otpCode.trim().length !== 6}
                    className="flex-1 py-2.5 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50 text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Verifying...</span>
                      </>
                    ) : (
                      'Verify OTP'
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Create New Password */}
            {resetStep === 'reset' && (
              <form onSubmit={handleResetPassword}>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">New Password</h2>
                <p className="text-gray-500 mb-6">Please enter your new secure password below.</p>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    required
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-blue-900 text-white rounded-xl font-semibold hover:bg-blue-800 transition-colors disabled:opacity-70"
                >
                  {isLoading ? 'Updating...' : 'Reset Password'}
                </button>
              </form>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;