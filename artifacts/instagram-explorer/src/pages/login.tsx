import React, { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin, useGetCurrentUser, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { Loader2, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Card } from '@/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: isUserLoading } = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const loginMutation = useLogin();
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  useEffect(() => {
    if (user?.loggedIn) {
      setLocation('/');
    }
  }, [user, setLocation]);

  const onSubmit = async (data: LoginFormValues) => {
    try {
      const result = await loginMutation.mutateAsync({ data });
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation('/');
      } else {
        form.setError('root', { message: result.error || 'Login failed' });
      }
    } catch (err: any) {
      form.setError('root', { message: err?.message || 'An unexpected error occurred' });
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background animate-in fade-in duration-500">
      <div className="w-full max-w-sm space-y-4">
        <Card className="p-8 border-border bg-card shadow-xl flex flex-col items-center">
          <div className="mb-8 mt-4 text-center space-y-2">
            <h1 className="text-3xl font-serif italic tracking-wide text-foreground">Instagram</h1>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input 
                        placeholder="Phone number, username, or email" 
                        className="bg-background text-sm h-10 border-border/60 focus-visible:ring-1 focus-visible:ring-border"
                        autoComplete="username"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Password" 
                        className="bg-background text-sm h-10 border-border/60 focus-visible:ring-1 focus-visible:ring-border"
                        autoComplete="current-password"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root && (
                <div className="text-destructive text-sm text-center py-2">
                  {form.formState.errors.root.message}
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold mt-2 h-9 rounded-lg"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Log in"
                )}
              </Button>
              
              <div className="flex items-center gap-4 my-6">
                <div className="h-px bg-border/60 flex-1"></div>
                <div className="text-sm text-muted-foreground font-semibold">OR</div>
                <div className="h-px bg-border/60 flex-1"></div>
              </div>

              <div className="text-center">
                <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Forgot password?
                </a>
              </div>
            </form>
          </Form>
        </Card>

        <Card className="p-6 border-border bg-card shadow-sm text-center">
          <p className="text-sm text-foreground">
            Don't have an account?{' '}
            <a href="#" className="text-primary font-semibold hover:text-primary/90">Sign up</a>
          </p>
        </Card>
      </div>
    </div>
  );
}
