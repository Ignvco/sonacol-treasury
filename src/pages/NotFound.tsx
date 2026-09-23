import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Compass, MoveLeft } from "lucide-react";

/** Spanish-only screen: no template copy, no translation keys left on screen. */
const NotFound = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    console.error("Ruta inexistente:", pathname);
  }, [pathname]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-16">
      <div className="t-card w-full max-w-lg p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-dark">
          <Compass size={26} strokeWidth={1.8} />
        </span>
        <p className="t-label mt-5">Error 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          No encontramos esta página
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          La dirección que abriste no existe o cambió de nombre. Vuelve a Hoy
          para seguir con tu tesorería.
        </p>
        <Link to="/today" className="t-button-primary mt-6">
          <MoveLeft size={16} strokeWidth={1.9} />
          Volver a Hoy
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
