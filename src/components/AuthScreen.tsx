import { useState, FormEvent } from 'react';
import { supabase } from '../supabase';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, AtSign, Loader2, Eye, EyeOff } from 'lucide-react';
import { Profile } from '../types';

interface AuthScreenProps {
  onAuthComplete: (profile: Profile) => void;
}

export default function AuthScreen({ onAuthComplete }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Email confirmation states
  const [isConfirmationSent, setIsConfirmationSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [showResendButton, setShowResendButton] = useState(false);

  const handleResendConfirmation = async () => {
    if (!email) {
      setErrorMsg('Please enter your email address to resend confirmation.');
      return;
    }
    setResending(true);
    setErrorMsg('');
    setResendSuccess(false);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) throw error;
      setResendSuccess(true);
    } catch (err: any) {
      console.error('Error resending confirmation:', err);
      setErrorMsg(err.message || 'Failed to resend confirmation email.');
    } finally {
      setResending(false);
    }
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setResendSuccess(false);
    setShowResendButton(false);
    setLoading(true);

    try {
      if (isSignUp) {
        if (!username || !displayName) {
          throw new Error('Please fill in all profile fields');
        }

        const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (cleanUsername.length < 3) {
          throw new Error('Username must be at least 3 characters and alphanumeric');
        }

        // 1. Check if username is already taken
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', cleanUsername)
          .maybeSingle();

        if (checkError) throw checkError;
        if (existingUser) {
          throw new Error('Username is already taken');
        }

        // 2. Perform Supabase Auth Sign Up
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        if (!authData.user) {
          throw new Error('Could not create account');
        }

        // Save pending profile to local storage immediately
        const pendingProfile = {
          id: authData.user.id,
          email,
          username: cleanUsername,
          display_name: displayName,
        };
        try {
          localStorage.setItem('vypervic_pending_profile', JSON.stringify(pendingProfile));
        } catch (storageErr) {
          console.warn('Could not cache pending profile to localStorage:', storageErr);
        }

        // Attempt to auto-login if session is not immediately returned
        let activeSession = authData.session;
        if (!activeSession) {
          try {
            const { data: signInData } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            activeSession = signInData.session;
          } catch (e) {
            console.warn('Auto-login failed:', e);
          }
        }

        if (!activeSession) {
          // If no active session yet, email confirmation is active on Supabase.
          // Show the Check Your Inbox confirmation screen.
          setIsConfirmationSent(true);
          return;
        }

        // 3. Insert or Update Profile (if we do have an active session)
        const newProfile = {
          id: authData.user.id,
          email,
          username: cleanUsername,
          display_name: displayName,
          about: 'Hey there! I am using VyperVic.',
          is_online: true,
          last_seen: new Date().toISOString(),
        };

        let profile = null;
        try {
          const { data: p, error: profileError } = await supabase
            .from('profiles')
            .upsert(newProfile)
            .select('*')
            .single();
          if (!profileError) {
            profile = p;
            localStorage.removeItem('vypervic_pending_profile');
          } else {
            console.warn('Profile upsert error:', profileError);
          }
        } catch (e) {
          console.warn('Profile upsert exception:', e);
        }

        if (profile) {
          onAuthComplete(profile);
        } else {
          // Fallback if upsert failed but session is active
          setIsSignUp(false);
          setErrorMsg('Account created! Please establish a secure link below to login.');
        }
      } else {
        // Sign In
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        if (!authData.user) {
          throw new Error('Sign in failed');
        }

        // Fetch corresponding profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (profile) {
          // Update online status
          await supabase
            .from('profiles')
            .update({ is_online: true, last_seen: new Date().toISOString() })
            .eq('id', profile.id);

          onAuthComplete({ ...profile, is_online: true });
        } else {
          // Fallback if profile doesn't exist yet
          const tempProfile = {
            id: authData.user.id,
            email,
            username: email.split('@')[0],
            display_name: email.split('@')[0],
            about: 'Hey there! I am using VyperVic.',
            is_online: true,
            last_seen: new Date().toISOString(),
          };
          const { data: createdProf, error: createError } = await supabase
            .from('profiles')
            .upsert(tempProfile)
            .select('*')
            .single();

          if (createError) throw createError;
          onAuthComplete(createdProf);
        }
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      const isUnconfirmed = err.message?.toLowerCase().includes('email not confirmed') || 
                            err.message?.toLowerCase().includes('confirm your email') ||
                            err.message?.toLowerCase().includes('verification');
      
      if (isUnconfirmed) {
        setErrorMsg('Your email has not been confirmed yet. A confirmation email was sent to your address. Please click the link inside it to activate your account, or click the button below to resend the activation link.');
        setShowResendButton(true);
      } else {
        setErrorMsg(err.message || 'An error occurred during authentication.');
        setShowResendButton(false);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col justify-between bg-[#080b10] px-6 py-10 overflow-hidden select-none">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(124,92,255,0.22),transparent_45%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_85%,rgba(32,227,162,0.1),transparent_50%)] pointer-events-none" />

      {/* Header / Logo */}
      <div className="flex flex-col items-center mt-8 relative z-10">
        <div className="relative w-16 h-16 flex items-center justify-center mb-3">
          <div className="absolute inset-[-10px] rounded-full bg-[radial-gradient(circle,rgba(32,227,162,0.25),transparent_65%)] blur-[6px]" />
          <svg width="60" height="60" viewBox="0 0 150 150" fill="none">
            <defs>
              <linearGradient id="authLogoGrad" x1="0" y1="0" x2="150" y2="150" gradientUnits="userSpaceOnUse">
                <stop stopColor="#20e3a2" />
                <stop offset="1" stopColor="#7c5cff" />
              </linearGradient>
            </defs>
            <path
              d="M30 40 C30 20, 60 15, 75 35 C95 60, 60 65, 55 80 C50 95, 85 100, 90 75 C93 60, 75 55, 70 65 C65 75, 80 85, 100 78 C118 71, 118 45, 100 35 C85 27, 75 45, 85 55"
              stroke="url(#authLogoGrad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-black text-white tracking-wide">
          Vyper<span className="bg-gradient-to-r from-[#20e3a2] to-[#7c5cff] bg-clip-text text-transparent">Vic</span>
        </h1>
        <p className="text-xs text-[#8d97ab] font-medium tracking-wide mt-1">
          {isSignUp ? 'Create your secure portal identity' : 'Enter the encrypted chat dimension'}
        </p>
      </div>

      {/* Form Area */}
      <div className="flex-1 flex flex-col justify-center my-6 relative z-10">
        <AnimatePresence mode="wait">
          {isConfirmationSent ? (
            <motion.div
              key="confirmation-sent"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25 }}
              className="space-y-6 text-center"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-[#20e3a2]/10 border border-[#20e3a2]/20 flex items-center justify-center text-[#20e3a2] mb-2 shadow-[0_0_15px_rgba(32,227,162,0.1)]">
                <Mail className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white">Check Your Inbox</h2>
                <p className="text-xs text-[#8d97ab] leading-relaxed max-w-sm mx-auto">
                  A verification link has been dispatched to <span className="text-[#20e3a2] font-mono font-semibold">{email}</span>. Please authorize this link to confirm your portal identity before connecting.
                </p>
              </div>

              {resendSuccess ? (
                <div className="text-xs text-[#20e3a2] font-semibold bg-[#20e3a2]/10 border border-[#20e3a2]/20 rounded-xl p-3 leading-relaxed animate-pulse">
                  Verification email resent successfully! Check your inbox.
                </div>
              ) : errorMsg ? (
                <div className="text-xs text-[#ff5470] font-semibold bg-[#ff5470]/10 border border-[#ff5470]/20 rounded-xl p-3 leading-relaxed">
                  {errorMsg}
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={resending}
                  className="w-full relative py-3.5 rounded-2xl font-bold text-xs tracking-wider text-[#20e3a2] border border-[#20e3a2]/30 bg-[#20e3a2]/5 hover:bg-[#20e3a2]/10 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Resending Link...</span>
                    </>
                  ) : (
                    <span>RESEND VERIFICATION EMAIL</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmationSent(false);
                    setIsSignUp(false);
                    setErrorMsg('');
                    setResendSuccess(false);
                  }}
                  className="text-xs font-semibold text-[#8d97ab] hover:text-[#eef1f6] transition-colors cursor-pointer py-2"
                >
                  Back to Sign In
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key={isSignUp ? 'signup' : 'signin'}
              initial={{ opacity: 0, x: isSignUp ? 25 : -25 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isSignUp ? -25 : 25 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleAuth}
              className="space-y-4"
            >
              {isSignUp && (
                <>
                  {/* Display Name Input */}
                  <div className="space-y-1">
                    <div className="relative flex items-center bg-[#161d28] border border-[#212a38] rounded-2xl px-4 py-3.5 focus-within:border-[#20e3a2] transition-colors">
                      <User className="w-5 h-5 text-[#5a6478] mr-3" />
                      <input
                        type="text"
                        placeholder="Display Name"
                        className="flex-1 bg-transparent border-none outline-none text-sm text-[#eef1f6] font-semibold placeholder-[#5a6478]"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Username Input */}
                  <div className="space-y-1">
                    <div className="relative flex items-center bg-[#161d28] border border-[#212a38] rounded-2xl px-4 py-3.5 focus-within:border-[#20e3a2] transition-colors">
                      <AtSign className="w-5 h-5 text-[#5a6478] mr-3" />
                      <input
                        type="text"
                        placeholder="username"
                        className="flex-1 bg-transparent border-none outline-none text-sm text-[#eef1f6] font-semibold placeholder-[#5a6478] font-mono"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Email Input */}
              <div className="space-y-1">
                <div className="relative flex items-center bg-[#161d28] border border-[#212a38] rounded-2xl px-4 py-3.5 focus-within:border-[#20e3a2] transition-colors">
                  <Mail className="w-5 h-5 text-[#5a6478] mr-3" />
                  <input
                    type="email"
                    placeholder="Email Address"
                    className="flex-1 bg-transparent border-none outline-none text-sm text-[#eef1f6] font-semibold placeholder-[#5a6478]"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1">
                <div className="relative flex items-center bg-[#161d28] border border-[#212a38] rounded-2xl px-4 py-3.5 focus-within:border-[#20e3a2] transition-colors">
                  <Lock className="w-5 h-5 text-[#5a6478] mr-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    className="flex-1 bg-transparent border-none outline-none text-sm text-[#eef1f6] font-semibold placeholder-[#5a6478]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-[#5a6478] hover:text-[#8d97ab] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              {/* Error Message & Resend Option */}
              {errorMsg && (
                <div className="space-y-3">
                  <p className="text-xs text-[#ff5470] font-semibold bg-[#ff5470]/10 border border-[#ff5470]/20 rounded-xl p-3 text-center leading-relaxed">
                    {errorMsg}
                  </p>
                  {showResendButton && (
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={resending}
                      className="w-full relative py-3 rounded-2xl font-bold text-xs tracking-wider text-[#20e3a2] border border-[#20e3a2]/20 bg-[#20e3a2]/5 hover:bg-[#20e3a2]/10 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {resending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Resending Link...</span>
                        </>
                      ) : resendSuccess ? (
                        <span>SENT! CHECK YOUR INBOX</span>
                      ) : (
                        <span>RESEND CONFIRMATION LINK</span>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full relative py-4 rounded-2xl font-bold text-sm tracking-wider text-black bg-gradient-to-r from-[#20e3a2] to-[#7c5cff] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer overflow-hidden flex items-center justify-center gap-2 shadow-[0_12px_24px_-8px_rgba(32,227,162,0.45)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Configuring channel...</span>
                  </>
                ) : (
                  <span>{isSignUp ? 'GENERATE KEYPAIR & JOIN' : 'ESTABLISH SECURE LINK'}</span>
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      {/* Auth Toggle footer */}
      <div className="text-center relative z-10 mb-2">
        <button
          onClick={() => {
            setIsSignUp(!isSignUp);
            setErrorMsg('');
            setResendSuccess(false);
            setShowResendButton(false);
            setIsConfirmationSent(false);
          }}
          className="text-xs font-semibold text-[#8d97ab] hover:text-[#eef1f6] cursor-pointer transition-colors"
        >
          {isSignUp ? (
            <span>
              Already have a secure key?{' '}
              <span className="text-[#20e3a2] underline underline-offset-4 decoration-1 font-bold">
                Connect identity
              </span>
            </span>
          ) : (
            <span>
              New to VyperVic?{' '}
              <span className="text-[#7c5cff] underline underline-offset-4 decoration-1 font-bold">
                Create new profile
              </span>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
