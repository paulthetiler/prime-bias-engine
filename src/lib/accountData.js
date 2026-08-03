// Impure account bootstrap: the small amount of database I/O that the pure
// ledger maths in lib/accounts.js deliberately avoids. Kept separate so
// lib/accounts.js stays trivially unit-testable.
import { base44 } from '@/api/base44Client';
import { activeAccounts, DEFAULT_STARTING_BALANCE } from '@/lib/accounts';
import { resolveStartingBalance } from '@/lib/journalStats';

/**
 * Ensure the signed-in user has at least one active trading account, returning
 * the full list of accounts. If none exists, a "Main Account" is created and
 * seeded from the earliest monthly-journal start balance (real user data) or the
 * neutral default. Idempotent: with an existing account it just returns them.
 *
 * @param {{ monthly?: any[] }} [opts]
 * @returns {Promise<any[]>} all accounts (including any just-created default)
 */
export async function ensureDefaultAccount({ monthly } = {}) {
  const accounts = await base44.entities.TradingAccount.list('created_at', 200);
  if (activeAccounts(accounts).length > 0) return accounts;

  const monthlyEntries = monthly ?? (await base44.entities.MonthlyJournal.list('-year', 200).catch(() => []));
  const { value } = resolveStartingBalance(monthlyEntries, DEFAULT_STARTING_BALANCE);

  const created = await base44.entities.TradingAccount.create({
    name: 'Main Account',
    currency: 'USD',
    starting_balance: value,
    created_at: new Date().toISOString(),
  });
  return [created, ...accounts];
}
