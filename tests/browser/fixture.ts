import type { Page } from "@playwright/test";
import * as XLSX from "xlsx";
import {
  decisionDb,
  session,
  query,
  admin,
  reader,
} from "../helpers/decision-db";
export async function setupDatabaseBrowser(
  page: Page,
  readonly = false,
  aal = "aal2",
) {
  const db = await decisionDb();
  if (readonly) {
    await query(db, "select treasury_set_access($1,$2,$3,$4,$5) s", [
      reader,
      "approved",
      "consulta",
      false,
      false,
    ]);
    await session(db, reader, aal);
  } else await session(db, admin, aal);
  const user = {
    id: readonly ? reader : admin,
    email: "test@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-09-13T10:00:00Z",
    factors: [],
  };
  const token = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        aal,
        exp: Math.floor(Date.now() / 1000) + 36000,
        role: "authenticated",
        amr: [],
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
  await page.addInitScript(
    ({ user, token }) =>
      localStorage.setItem(
        "sb-hhksaxwbwbvkoksxfhni-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "test-refresh-token",
          expires_at: Math.floor(Date.now() / 1000) + 36000,
          expires_in: 36000,
          token_type: "bearer",
          user,
        }),
      ),
    { user, token },
  );
  await page.route(
    "https://hhksaxwbwbvkoksxfhni.supabase.co/**",
    async (route) => {
      const url = new URL(route.request().url()),
        name = url.pathname.split("/").at(-1) ?? "";
      if (url.pathname.includes("/auth/")) return route.fulfill({ json: user });
      try {
        if (url.pathname.includes("/rpc/")) {
          if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid RPC");
          const body = route.request().postDataJSON() ?? {},
            keys = Object.keys(body);
          if (keys.some((k) => !/^p_[a-z_]+$/.test(k)))
            throw new Error("Invalid parameters");
          const params = keys.map((k) =>
            typeof body[k] === "object" &&
            body[k] !== null &&
            k !== "p_apply_rows"
              ? JSON.stringify(body[k])
              : body[k],
          );
          const result = await db.query(
            `select ${name}(${keys.map((k, i) => k + " => $" + (i + 1)).join(",")}) s`,
            params,
          );
          return route.fulfill({ json: result.rows[0].s });
        }
        if (name === "profiles") {
          const result = await db.query(
            "select id,name,email,role from profiles where id=$1",
            [user.id],
          );
          return route.fulfill({
            json: url.searchParams.has("id") ? result.rows[0] : result.rows,
          });
        }
        if (
          ![
            "daily_base_batches",
            "daily_base_rows",
            "fx_rates",
            "audit_logs",
          ].includes(name)
        )
          return route.fulfill({ json: [] });
        let sql = `select * from ${name}`;
        const args: unknown[] = [];
        for (const key of ["id", "batch_id"]) {
          const v = url.searchParams.get(key);
          if (v?.startsWith("eq.")) {
            args.push(v.slice(3));
            sql +=
              (args.length === 1 ? " where " : " and ") +
              key +
              "=$" +
              args.length;
          }
        }
        if (name === "daily_base_batches")
          sql += " order by cutoff desc,created_at desc,id desc";
        const result = await db.query(sql, args);
        const rows = JSON.parse(JSON.stringify(result.rows));
        for (const r of rows) if (r.cutoff) r.cutoff = r.cutoff.slice(0, 10);
        return route.fulfill({
          json: route.request().headers()["accept"]?.includes("object")
            ? rows[0]
            : rows,
        });
      } catch (e) {
        const error = e as { message: string; code?: string };
        return route.fulfill({
          status: 400,
          json: { message: error.message, code: error.code ?? "TEST" },
        });
      }
    },
  );
  await page.route("https://api.enter.pro/**", (route) => route.abort());
  return db;
}
