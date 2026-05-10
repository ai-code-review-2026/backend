import type { BillingCheckoutTotals, BillingCheckoutTotalsJSON, BillingCredits, BillingCreditsJSON, BillingMoneyAmount, BillingMoneyAmountJSON, BillingStatementTotals, BillingStatementTotalsJSON } from '@clerk/shared/types';
export declare const billingMoneyAmountFromJSON: (data: BillingMoneyAmountJSON) => BillingMoneyAmount;
export declare const billingCreditsFromJSON: (data: BillingCreditsJSON) => BillingCredits;
export declare const billingTotalsFromJSON: <T extends BillingStatementTotalsJSON | BillingCheckoutTotalsJSON>(data: T) => T extends {
    total_due_now: BillingMoneyAmountJSON;
} ? BillingCheckoutTotals : BillingStatementTotals;
