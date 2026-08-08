// Account data access kept separate from the pure ledger maths in lib/accounts.js.
import { base44 } from '@/api/base44Client';

/**
 * Return the signed-in user's trading accounts without silently creating one.
 *
 * Historically this helper auto-created a "Main Account" when none existed.
 * That hid an important setup decision (account name, currency and starting
 * balance) and made onboarding impossible to reason about. Account creation is
 * now always explicit: first-run onboarding or Settings → Trading accounts.
 *
 * The legacy function name is retained so existing callers do not need to change.
 * @returns {Promise<any[]>} all trading accounts
 */
export async function ensureDefaultAccount() {
  return base44.entities.TradingAccount.list('created_at', 200);
}
