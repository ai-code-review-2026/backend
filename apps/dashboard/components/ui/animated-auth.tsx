'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Checkbox } from './checkbox';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  ArrowRight,
  Loader2,
  Circle,
  Sparkles,
  Shield,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { Github } from '@/components/ui/social-icons';

// ============================================================================
// TYPES
// ============================================================================

interface SignInFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface SignUpFormData extends SignInFormData {
  name: string;
  confirmPassword: string;
}

interface AnimatedAuthProps {
  mode?: 'sign-in' | 'sign-up';
  onSubmit?: (data: SignInFormData | SignUpFormData) => Promise<void>;
  onGoogleAuth?: () => void;
  onGithubAuth?: () => void;
  redirectUrl?: string;
  showSocialAuth?: boolean;
  className?: string;
  brandName?: string;
  brandLogo?: React.ReactNode;
}

// ============================================================================
// ANIMATED BACKGROUND
// ============================================================================

function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Gradient orbs */}
      <motion.div
        animate={{
          x: [0, 30, 0],
          y: [0, -20, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/20 rounded-full blur-[100px]"
      />
      <motion.div
        animate={{
          x: [0, -20, 0],
          y: [0, 30, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-500/20 rounded-full blur-[100px]"
      />
      <motion.div
        animate={{
          x: [0, 15, 0],
          y: [0, 15, 0],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-orange-500/10 rounded-full blur-[80px]"
      />
      
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem]" />
    </div>
  );
}

// ============================================================================
// FEATURE CARDS
// ============================================================================

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="flex items-start gap-3 p-4 rounded-xl bg-card/80 border border-border backdrop-blur-xl"
    >
      <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500/20 to-teal-500/20 text-primary">
        {icon}
      </div>
      <div>
        <h4 className="font-medium text-foreground text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </motion.div>
  );
}

// ============================================================================
// SOCIAL AUTH BUTTON
// ============================================================================

function SocialButton({
  icon,
  label,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={loading}
      className="flex-1 gap-2 bg-card/80 border-border hover:bg-card-hover hover:border-border/80 text-foreground backdrop-blur-xl"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </Button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AnimatedAuth({
  mode = 'sign-in',
  onSubmit,
  onGoogleAuth,
  onGithubAuth,
  showSocialAuth = true,
  className,
  brandName = 'Devora',
  brandLogo,
}: AnimatedAuthProps) {
  const [currentMode, setCurrentMode] = useState(mode);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<SignUpFormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    rememberMe: false,
  });

  const isSignUp = currentMode === 'sign-up';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) return;
    
    setLoading(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Auth error:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: keyof SignUpFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className={cn('min-h-screen flex', className)}>
      {/* Left panel - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-background overflow-hidden">
        <AnimatedBackground />
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            {brandLogo || (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Zap className="h-10 w-10 text-primary" />
                  <div className="absolute inset-0 bg-primary blur-xl opacity-35" />
                </div>
                <span className="text-3xl font-bold text-foreground">{brandName}</span>
              </div>
            )}
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl xl:text-5xl font-bold text-foreground leading-tight mb-4"
          >
            {isSignUp ? 'Start your journey' : 'Welcome back'}
            <br />
            <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-teal-400 text-transparent bg-clip-text">
              {isSignUp ? 'with AI-powered code review' : 'to smarter code review'}
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-muted-foreground text-lg mb-10 max-w-md"
          >
            {isSignUp
              ? 'Join thousands of developers shipping better code faster.'
              : 'Continue your secure development workflow.'}
          </motion.p>

          {/* Feature cards */}
          <div className="space-y-4">
            <FeatureCard
              icon={<Sparkles className="h-5 w-5" />}
              title="AI-Powered Analysis"
              description="Get intelligent code suggestions in real-time"
              delay={0.3}
            />
            <FeatureCard
              icon={<Shield className="h-5 w-5" />}
              title="Security First"
              description="Enterprise-grade security for your codebase"
              delay={0.4}
            />
            <FeatureCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Trusted by Teams"
              description="10,000+ developers rely on our platform"
              delay={0.5}
            />
          </div>
        </div>
      </div>

      {/* Right panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-8">
            {brandLogo || (
              <div className="flex items-center justify-center gap-2 mb-4">
                <Zap className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold text-foreground">{brandName}</span>
              </div>
            )}
          </div>

          {/* Form header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {isSignUp ? 'Create your account' : 'Sign in to your account'}
            </h2>
            <p className="text-muted-foreground">
              {isSignUp ? (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => setCurrentMode('sign-in')}
                    className="text-primary hover:text-orange-hover font-medium"
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => setCurrentMode('sign-up')}
                    className="text-primary hover:text-orange-hover font-medium"
                  >
                    Sign up
                  </button>
                </>
              )}
            </p>
          </div>

          {/* Social auth */}
          {showSocialAuth && (
            <>
              <div className="flex gap-3 mb-6">
                <SocialButton
                  icon={<Circle className="h-4 w-4 fill-current" />}
                  label="Google"
                  onClick={onGoogleAuth}
                />
                <SocialButton
                  icon={<Github className="h-4 w-4" />}
                  label="GitHub"
                  onClick={onGithubAuth}
                />
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-background text-muted-foreground">or continue with email</span>
                </div>
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {isSignUp && (
                <motion.div
                  key="name-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Label htmlFor="name" className="text-gray-300">
                    Full Name
                  </Label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      className="pl-10 bg-card/80 border-border focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <Label htmlFor="email" className="text-foreground">
                Email Address
              </Label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="pl-10 bg-card/80 border-border focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="password" className="text-foreground">
                  Password
                </Label>
                {!isSignUp && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:text-orange-hover"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  className="pl-10 pr-10 bg-card/80 border-border focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {isSignUp && (
                <motion.div
                  key="confirm-password-field"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Label htmlFor="confirmPassword" className="text-foreground">
                    Confirm Password
                  </Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={(e) => updateField('confirmPassword', e.target.value)}
                      className="pl-10 pr-10 bg-card/80 border-border focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2">
              <Checkbox
                id="rememberMe"
                checked={formData.rememberMe}
                onCheckedChange={(checked) => updateField('rememberMe', checked as boolean)}
                className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <Label htmlFor="rememberMe" className="text-sm text-muted-foreground cursor-pointer">
                {isSignUp ? 'I agree to the Terms of Service and Privacy Policy' : 'Remember me for 30 days'}
              </Label>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-700 hover:from-orange-400 hover:to-orange-600 text-white border-0 h-11"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-muted-foreground">
            By continuing, you agree to our{' '}
            <a href="/terms" className="text-foreground hover:text-primary">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" className="text-foreground hover:text-primary">
              Privacy Policy
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

// ============================================================================
// CLERK WRAPPER COMPONENT
// ============================================================================

/**
 * A wrapper component to style Clerk's SignIn/SignUp without dev mode branding.
 * Use this around Clerk components to apply custom styling.
 */
export function ClerkAuthWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'clerk-auth-wrapper',
        className
      )}
    >
      {children}
    </div>
  );
}
