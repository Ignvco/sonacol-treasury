import { supabase } from "@/integrations/supabase/client";
import { parsePublicBankCatalog, type PublicBankAccountBinding } from "@/financial-engine/bank-catalog-public";
import { canonicalBankAccountNumber } from "@/financial-engine/bank-account-identity";

interface RpcResult { data: unknown; error: { code?: string; message: string } | null }
interface BankRpc { rpc(name: string, args?: Record<string,unknown>): Promise<RpcResult> }
const rpc = supabase as unknown as BankRpc;
export type BankCatalogState = {installed: boolean; bindings: PublicBankAccountBinding[]};
export const bankAccountCatalogService = {
  async load(): Promise<BankCatalogState> {
    const {data,error} = await rpc.rpc("treasury_bank_catalog");
    // Deploying the frontend before the reviewed SQL must not break Bancos.
    if (error && ["PGRST202","42883"].includes(error.code ?? "")) return {installed:false,bindings:[]};
    if (error) throw new Error(error.message);
    return {installed:true,bindings:parsePublicBankCatalog(data)};
  },
  /** The full number is sent only to the privileged write RPC, never returned/stored in browser state. */
  async save(x: {
    company:string; ledger:string; currency:string; bank:string; accountNumber:string;
    evidenceRef:string; expectedRevision:number|null;
  }): Promise<PublicBankAccountBinding> {
    const {data,error} = await rpc.rpc("treasury_save_bank_binding",{
      p_company:x.company,p_ledger:x.ledger,p_currency:x.currency,p_bank:x.bank,
      p_account_number:canonicalBankAccountNumber(x.accountNumber),
      p_evidence_ref:x.evidenceRef.trim(),p_expected_revision:x.expectedRevision,
    });
    if (error) throw new Error(error.message);
    const [entry] = parsePublicBankCatalog([data]);
    return entry;
  },
};
