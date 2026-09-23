import { useState } from "react";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/treasury/SectionCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";

/** Motivo real del rechazo, para que el cambio de contraseña sea diagnosticable. */
function passwordMessage(error: { message?: string }): string {
  const detail = (error.message ?? "").toLowerCase();
  if (detail.includes("at least") || detail.includes("too short"))
    return "La contraseña debe tener al menos 8 caracteres.";
  if (detail.includes("should be different"))
    return "Elige una contraseña distinta a la anterior.";
  if (detail.includes("session") || detail.includes("not authenticated"))
    return "Tu sesión expiró. Vuelve a ingresar y repite el cambio.";
  return `No se pudo cambiar la contraseña: ${error.message ?? "error desconocido"}.`;
}

/**
 * Cambio de contraseña propio: cada persona administra su clave sin depender de
 * un administrador ni del envío de correo, que la instalación no configura.
 */
export function AccountSecurityCard() {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setDone("");
    setError("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== repeat) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setRepeat("");
      setDone("Contraseña actualizada. Úsala en tu próximo ingreso.");
    } catch (e) {
      setError(
        e instanceof Error
          ? passwordMessage(e)
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Contraseña"
      subtitle="Cambia tu propia clave de acceso"
      bodyClassName="flex flex-col gap-3"
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="grid gap-1.5 text-[12px] font-medium text-muted-foreground">
          Nueva contraseña
          <input
            className="t-input w-full"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-[12px] font-medium text-muted-foreground">
          Repite la contraseña
          <input
            className="t-input w-full"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="t-button-primary justify-center"
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" strokeWidth={1.9} />
          )}
          Cambiar contraseña
        </button>
      </form>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Mínimo 8 caracteres. La cuenta {user?.email ?? "de esta sesión"} conserva
        su rol y sus permisos.
      </p>
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-[12px] font-medium text-success"
      >
        {done && <Check className="h-3.5 w-3.5" strokeWidth={2.2} />}
        {done}
      </p>
      {error && (
        <p role="alert" className="text-[12px] font-medium text-danger">
          {error}
        </p>
      )}
    </SectionCard>
  );
}
