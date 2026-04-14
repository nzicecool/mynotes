import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, ArrowLeft, Mail, CheckCircle2, Loader2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), origin: window.location.origin }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Request failed");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-slate-800">MyNotes</span>
        </div>

        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          {submitted ? (
            <>
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-3">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                  </div>
                </div>
                <CardTitle className="text-xl text-slate-800">Check your inbox</CardTitle>
                <CardDescription className="text-slate-500 mt-1">
                  If an account exists for <strong>{email}</strong>, a reset link has been sent.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertDescription className="text-amber-800 text-sm">
                    <strong>Self-hosted deployment?</strong> If no email server is configured, the reset link is printed to the server console log. Ask your administrator to retrieve it.
                  </AlertDescription>
                </Alert>
                <p className="text-center text-sm text-slate-500">
                  The link expires in <strong>1 hour</strong>.
                </p>
                <Link href="/login">
                  <Button variant="outline" className="w-full gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Sign In
                  </Button>
                </Link>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="pb-4">
                <div className="flex justify-center mb-3">
                  <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center">
                    <Mail className="w-7 h-7 text-indigo-600" />
                  </div>
                </div>
                <CardTitle className="text-xl text-slate-800 text-center">Forgot your password?</CardTitle>
                <CardDescription className="text-slate-500 text-center mt-1">
                  Enter your email address and we'll send you a reset link.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-700">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="h-11 border-slate-200 focus:border-indigo-400 focus:ring-indigo-400"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                    disabled={loading || !email.trim()}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending reset link…
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>

                  <Link href="/login">
                    <Button variant="ghost" className="w-full gap-2 text-slate-600 hover:text-slate-800">
                      <ArrowLeft className="w-4 h-4" />
                      Back to Sign In
                    </Button>
                  </Link>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
