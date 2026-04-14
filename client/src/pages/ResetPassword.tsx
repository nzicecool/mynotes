import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, KeyRound, CheckCircle2, Loader2, AlertTriangle, Eye, EyeOff } from "lucide-react";

function getPasswordStrength(password: string): { label: string; color: string; width: string } {
  if (password.length === 0) return { label: "", color: "bg-slate-200", width: "0%" };
  if (password.length < 8) return { label: "Too short", color: "bg-red-400", width: "20%" };
  let score = 0;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { label: "Weak", color: "bg-orange-400", width: "40%" };
  if (score === 2) return { label: "Fair", color: "bg-yellow-400", width: "60%" };
  if (score === 3) return { label: "Good", color: "bg-blue-400", width: "80%" };
  return { label: "Strong", color: "bg-green-500", width: "100%" };
}

export default function ResetPassword() {
  const [location] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const uid = params.get("uid") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = newPassword.length >= 8 && passwordsMatch && !loading;

  // Guard: if no token/uid in URL, show an error immediately
  const invalidLink = !token || !uid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: Number(uid), token, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Reset failed");

      setSuccess(true);
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
          {/* Invalid link */}
          {invalidLink && (
            <>
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-3">
                  <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-red-500" />
                  </div>
                </div>
                <CardTitle className="text-xl text-slate-800">Invalid reset link</CardTitle>
                <CardDescription className="text-slate-500 mt-1">
                  This link is missing required parameters. Please request a new reset link.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/forgot-password">
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                    Request a new link
                  </Button>
                </Link>
              </CardContent>
            </>
          )}

          {/* Success state */}
          {!invalidLink && success && (
            <>
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-3">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                  </div>
                </div>
                <CardTitle className="text-xl text-slate-800">Password updated</CardTitle>
                <CardDescription className="text-slate-500 mt-1">
                  Your password has been changed successfully. You can now sign in with your new password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/login">
                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                    Sign in
                  </Button>
                </Link>
              </CardContent>
            </>
          )}

          {/* Reset form */}
          {!invalidLink && !success && (
            <>
              <CardHeader className="pb-4">
                <div className="flex justify-center mb-3">
                  <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center">
                    <KeyRound className="w-7 h-7 text-indigo-600" />
                  </div>
                </div>
                <CardTitle className="text-xl text-slate-800 text-center">Set a new password</CardTitle>
                <CardDescription className="text-slate-500 text-center mt-1">
                  Choose a strong password for your account.
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
                    <Label htmlFor="newPassword" className="text-slate-700">New password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="At least 8 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        autoFocus
                        className="h-11 pr-10 border-slate-200 focus:border-indigo-400 focus:ring-indigo-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Password strength bar */}
                    {newPassword.length > 0 && (
                      <div className="space-y-1">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                            style={{ width: strength.width }}
                          />
                        </div>
                        <p className="text-xs text-slate-500">
                          Strength: <span className="font-medium">{strength.label}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-slate-700">Confirm new password</Label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="Repeat your new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className={`h-11 border-slate-200 focus:border-indigo-400 focus:ring-indigo-400 ${
                        confirmPassword && !passwordsMatch ? "border-red-400 focus:border-red-400" : ""
                      }`}
                    />
                    {confirmPassword && !passwordsMatch && (
                      <p className="text-xs text-red-500">Passwords do not match</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                    disabled={!canSubmit}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating password…
                      </>
                    ) : (
                      "Update password"
                    )}
                  </Button>

                  <p className="text-center text-sm text-slate-500">
                    Remember your password?{" "}
                    <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                      Sign in
                    </Link>
                  </p>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
