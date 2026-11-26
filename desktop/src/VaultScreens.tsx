import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, FileArchive, KeyRound, LockKeyhole, NotebookPen, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { validatePin } from "./helpers";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}><span className="brand-symbol"><NotebookPen size={compact ? 20 : 25} aria-hidden="true" /></span><div><strong>MyNotes<span className="brand-dot">.</span></strong><small>DESKTOP · OFFLINE</small></div></div>;
}

export function VaultShell({ children }: { children: ReactNode }) {
  return <main className="vault-shell"><div className="vault-intro"><Brand /><div className="intro-copy"><span className="eyebrow">A LITTLE SPACE OF YOUR OWN</span><h1>Your thoughts.<br />Only yours.</h1><p>A quiet home for notes, ideas and everyday lists.<br />Encrypted on this device. Never sent to a server.</p></div><div className="offline-badge"><ShieldCheck size={16} aria-hidden="true" /> No accounts. No cloud. Just your notes.</div></div><section className="vault-panel">{children}</section></main>;
}

export function PinField({ id, label, value, onChange, autoFocus, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; autoFocus?: boolean; disabled?: boolean }) {
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} type="password" inputMode="numeric" autoComplete="off" spellCheck={false} value={value} onChange={event => onChange(event.target.value)} autoFocus={autoFocus} disabled={disabled} aria-describedby={`${id}-hint`} /><small id={`${id}-hint`}>At least 6 digits. Leading zeroes are kept.</small></label>;
}

export function InlineError({ message }: { message: string | null }) {
  return <div className="inline-error" role="status" aria-live="polite">{message}</div>;
}

export function AccessScreen({ mode, busy, error, remaining, onSubmit, onMode, onRestore }: { mode: "setup" | "unlock" | "recover"; busy: boolean; error: string | null; remaining?: number; onSubmit: (pin: string, code?: string) => void; onMode: (mode: "unlock" | "recover") => void; onRestore: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const isNew = mode !== "unlock";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validatePin(pin, isNew ? confirm : undefined) || (mode === "recover" && !code.trim() ? "Enter a recovery code." : null);
    setValidation(problem);
    if (!problem) onSubmit(pin, code.trim());
  };
  return <VaultShell><div className="vault-card"><span className="card-icon"><LockKeyhole size={26} aria-hidden="true" /></span><span className="eyebrow">YOUR PRIVATE VAULT</span><h2>{mode === "setup" ? "Make yourself at home" : mode === "recover" ? "Recover your vault" : "Welcome back"}</h2><p className="muted">{mode === "setup" ? "Choose a PIN to protect your notes. You’ll get five recovery codes to keep somewhere safe." : mode === "recover" ? "Use one recovery code and choose a new PIN. Your notes stay intact." : "Your vault is locked. Enter your PIN to pick up where you left off."}</p><form onSubmit={submit} className="form-stack"><fieldset disabled={busy}>
    {mode === "recover" && <label className="field" htmlFor="access-code"><span>Recovery code</span><input id="access-code" autoComplete="off" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} autoFocus /><small>{remaining !== undefined ? `${remaining} codes remaining in this vault.` : "Use a code saved from this vault."}</small></label>}
    <PinField id="access-pin" label={isNew ? "New PIN" : "PIN"} value={pin} onChange={setPin} autoFocus={mode !== "recover"} />
    {isNew && <PinField id="access-confirm" label="Confirm new PIN" value={confirm} onChange={setConfirm} />}
    <InlineError message={validation || error} />
    <button className="button primary wide" type="submit">{busy ? "Please wait…" : mode === "setup" ? "Create encrypted vault" : mode === "recover" ? "Recover & change PIN" : "Unlock vault"}<ArrowRight size={16} aria-hidden="true" /></button>
  </fieldset></form>
  {mode === "unlock" && <button className="text-button" disabled={busy} onClick={() => onMode("recover")}><KeyRound size={14} aria-hidden="true" /> Forgot your PIN? Use a recovery code</button>}
  {mode === "recover" && <button className="text-button" disabled={busy} onClick={() => onMode("unlock")}><ArrowLeft size={14} aria-hidden="true" /> Back to PIN unlock</button>}
  <div className="card-divider" /><button className="button secondary wide" disabled={busy} onClick={onRestore}><FileArchive size={16} aria-hidden="true" /> Restore an encrypted backup</button><p className="fine-print">Everything stays on this device. Keep your PIN and recovery codes safe: there is no account-based reset.</p></div></VaultShell>;
}

export function CodesScreen({ codes, fresh, busy, error, onContinue }: { codes: string[]; fresh: boolean; busy: boolean; error: string | null; onContinue: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  return <VaultShell><div className="vault-card codes-card"><span className="card-icon"><KeyRound size={26} aria-hidden="true" /></span><span className="eyebrow">KEEP THESE SOMEWHERE SAFE</span><h2>Your recovery codes</h2><p className="muted">Save all {codes.length} codes outside this device. Any one code can recover your vault; recovery replaces the entire current code set. Older backups retain their original recovery access. These secrets are not saved by the interface.</p>
    {fresh && <div className="warning-box"><strong>New codes for this vault</strong><p>Replace your saved codes with these. Older copies and encrypted backups are not remotely revoked; their recovery codes may still open those older copies. Keep or securely remove old backups intentionally.</p></div>}
    <ol className="recovery-codes">{codes.map((code, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><code>{code}</code></li>)}</ol>
    <label className="check-field"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy} /><span>I have recorded every code in a safe place.</span></label><InlineError message={error} /><button className="button primary wide" disabled={!acknowledged || busy} onClick={onContinue}>{busy ? "Opening vault…" : "I’ve saved my codes"}<Check size={16} aria-hidden="true" /></button></div></VaultShell>;
}

export function RestoreDialog({ open, replacement, busy, error, notice, onClose, onSubmit }: { open: boolean; replacement: boolean; busy: boolean; error: string | null; notice: string | null; onClose: () => void; onSubmit: (code: string, pin: string) => void }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validatePin(pin, confirm) || (!code.trim() ? "Enter a recovery code from the backup." : null) || (replacement && !ack ? "Confirm that the current vault will be replaced." : null);
    setValidation(problem);
    if (!problem) onSubmit(code.trim(), pin);
  };
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}><DialogContent className="desktop-dialog" showCloseButton={!busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>Restore encrypted backup</DialogTitle><DialogDescription>Use a recovery code that belongs to the backup, then set a new PIN. The next step opens the native file chooser.</DialogDescription></DialogHeader><form className="form-stack" onSubmit={submit}><fieldset disabled={busy}>
    {replacement && <div className="warning-box"><strong>This replaces the current vault</strong><p>Current notes will be replaced, not merged. Export an encrypted backup first if you want to keep them.</p><label className="check-field"><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} /><span>I understand and confirm current-data replacement.</span></label></div>}
    <label className="field" htmlFor="restore-code"><span>Backup recovery code</span><input id="restore-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" spellCheck={false} autoFocus /></label>
    <PinField id="restore-pin" label="New PIN" value={pin} onChange={setPin} /><PinField id="restore-confirm" label="Confirm new PIN" value={confirm} onChange={setConfirm} />
    <InlineError message={validation || error} />{notice && <p className="muted" role="status">{notice}</p>}<div className="dialog-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">{busy ? "Restoring…" : "Choose backup & restore"}</button></div>
  </fieldset></form></DialogContent></Dialog>;
}

export function SettingsDialog({ open, busy, notice, onClose, onChangePin, onRegenerate, onBackup, onRestore }: { open: boolean; busy: boolean; notice: string | null; onClose: () => void; onChangePin: (current: string, pin: string, done: () => void) => void; onRegenerate: () => void; onBackup: () => void; onRestore: () => void }) {
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [regenerateAck, setRegenerateAck] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validatePin(current) || validatePin(pin, confirm);
    setValidation(problem);
    if (!problem) onChangePin(current, pin, () => { setCurrent(""); setPin(""); setConfirm(""); });
  };
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}><DialogContent className="desktop-dialog settings-dialog" showCloseButton={!busy} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>Vault settings</DialogTitle><DialogDescription>Security and encrypted backups. There are no accounts or sync services.</DialogDescription></DialogHeader>
    <section className="settings-section"><h3>Change PIN</h3><form className="form-stack" onSubmit={submit}><fieldset disabled={busy}><PinField id="settings-current" label="Current PIN" value={current} onChange={setCurrent} /><div className="two-fields"><PinField id="settings-pin" label="New PIN" value={pin} onChange={setPin} /><PinField id="settings-confirm" label="Confirm new PIN" value={confirm} onChange={setConfirm} /></div><InlineError message={validation} /><button className="button secondary" type="submit">Change PIN</button></fieldset></form></section>
    <section className="settings-section"><h3>Recovery codes</h3><p className="muted">Generate five replacement codes. Save the new set immediately. Older vault copies and backups are not revoked and can retain their older codes.</p><label className="check-field"><input type="checkbox" checked={regenerateAck} onChange={event => setRegenerateAck(event.target.checked)} disabled={busy} /><span>I understand I must replace my recorded codes.</span></label><button className="button secondary" disabled={busy || !regenerateAck} onClick={onRegenerate}>Generate new recovery codes</button></section>
    <section className="settings-section"><h3>Encrypted backup</h3><p className="muted">A manual snapshot of your vault. Pending note edits are saved before export. Recovery codes belonging to a backup are needed to restore it.</p><div className="dialog-actions left"><button className="button secondary" disabled={busy} onClick={onBackup}><FileArchive size={15} aria-hidden="true" /> Export backup</button><button className="button secondary" disabled={busy} onClick={onRestore}>Restore backup…</button></div></section>
    <p className="fine-print">Lock policy: use Lock vault or Ctrl/Cmd+L. Closing the native window saves, locks and closes. No blur or inactivity lock; file choosers and dialogs never trigger one. Use your operating system’s screen lock when away.</p>{notice && <p className="notice" role="status" aria-live="polite">{notice}</p>}
  </DialogContent></Dialog>;
}
