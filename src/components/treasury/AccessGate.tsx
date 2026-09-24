import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
export function MfaSetup() {
  const { refreshProfile } = useAuth();
  const [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(error.message);
      else setFactor(data?.totp.find((f) => f.status === "verified")?.id ?? "");
    });
    return () => {
      alive = false;
    };
  }, []);
  const enroll = async () => {
    setBusy(true);
    setError("");
    try {
      const { data: factors, error: fe } =
        await supabase.auth.mfa.listFactors();
      if (fe) throw fe;
      for (const f of factors?.all ?? [])
        if (f.status === "unverified")
          await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "SONACOL",
      });
      if (error) throw error;
      setFactor(data.id);
      setQr(data.totp.qr_code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo configurar MFA.");
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (error) throw error;
      await refreshProfile();
      setQr("");
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Código no válido.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Usa una aplicación de autenticación. El segundo factor protege
        importaciones, MANUAL y permisos.
      </p>
      {!factor ? (
        <button
          className="t-button-primary"
          disabled={busy}
          onClick={() => void enroll()}
        >
          Configurar segundo factor
        </button>
      ) : (
        <form className="grid gap-3" onSubmit={verify}>
          {qr && (
            <img
              className="mx-auto w-52"
              src={qr}
              alt="Código QR para configurar tu autenticador"
            />
          )}
          <label className="grid gap-1 text-sm">
            Código de 6 dígitos
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              className="t-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button disabled={busy} className="t-button-primary">
            Verificar segundo factor
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
export function AccessGate() {
  const { user, refreshProfile, signOut } = useAuth();
  const [error, setError] = useState("");
  return (
    <main className="t-canvas flex min-h-dvh items-center justify-center p-4">
      <div className="t-card grid w-full max-w-md gap-5 p-7">
        <ShieldCheck className="text-brand" size={32} />
        <h1 className="text-xl font-semibold">
          {user?.accessStatus === "approved"
            ? "Protege tu sesión"
            : "Acceso pendiente de autorización"}
        </h1>
        {user?.accessStatus === "approved" ? (
          <MfaSetup />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Tu cuenta necesita aprobación del administrador para consultar la
              tesorería.
            </p>
            <button
              className="t-button-primary"
              onClick={() =>
                void refreshProfile().catch((e) => setError(e.message))
              }
            >
              Comprobar autorización
            </button>
          </>
        )}
        <button
          className="t-button-secondary"
          onClick={() => void signOut().catch((e) => setError(e.message))}
        >
          Cerrar sesión
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    </main>
  );
}
