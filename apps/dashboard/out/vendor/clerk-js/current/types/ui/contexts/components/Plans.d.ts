import type { Appearance, BillingPlanResource, BillingSubscriptionItemResource, BillingSubscriptionPlanPeriod } from '@clerk/shared/types';
import type { LocalizationKey } from '../../localization';
/**
 * Only remove decimal places if they are '00', to match previous behavior.
 */
export declare function normalizeFormatted(formatted: string): string;
export declare const usePaymentMethods: () => {
    data: import("@clerk/shared/index-Be2TJd-S").BillingPaymentMethodResource[];
    count: number;
    error: import("@clerk/shared/index-Be2TJd-S").ClerkAPIResponseError | null;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    page: number;
    pageCount: number;
    fetchPage: (size: number | ((_size: number) => number)) => void;
    fetchPrevious: () => void;
    fetchNext: () => void;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    revalidate: () => Promise<void>;
    setData: (data?: import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentMethodResource> | ((currentData?: import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentMethodResource> | undefined) => import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentMethodResource> | Promise<import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentMethodResource> | undefined> | undefined) | undefined) => Promise<import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentMethodResource> | undefined>;
};
export declare const usePaymentAttempts: () => {
    data: import("@clerk/shared/index-Be2TJd-S").BillingPaymentResource[];
    count: number;
    error: import("@clerk/shared/index-Be2TJd-S").ClerkAPIResponseError | null;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    page: number;
    pageCount: number;
    fetchPage: (size: number | ((_size: number) => number)) => void;
    fetchPrevious: () => void;
    fetchNext: () => void;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    revalidate: () => Promise<void>;
    setData: (data?: import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentResource> | ((currentData?: import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentResource> | undefined) => import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentResource> | Promise<import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentResource> | undefined> | undefined) | undefined) => Promise<import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPaymentResource> | undefined>;
};
export declare const useStatements: (externalParams?: {
    mode: "cache";
}) => {
    data: import("@clerk/shared/index-Be2TJd-S").BillingStatementResource[];
    count: number;
    error: import("@clerk/shared/index-Be2TJd-S").ClerkAPIResponseError | null;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    page: number;
    pageCount: number;
    fetchPage: (size: number | ((_size: number) => number)) => void;
    fetchPrevious: () => void;
    fetchNext: () => void;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    revalidate: () => Promise<void>;
    setData: (data?: import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingStatementResource> | ((currentData?: import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingStatementResource> | undefined) => import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingStatementResource> | Promise<import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingStatementResource> | undefined> | undefined) | undefined) => Promise<import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingStatementResource> | undefined>;
};
export declare const useSubscription: () => {
    subscriptionItems: import("@clerk/shared/index-Be2TJd-S").BillingSubscriptionItemResource[];
    data: import("@clerk/shared/index-Be2TJd-S").BillingSubscriptionResource | undefined | null;
    error: Error | undefined;
    isLoading: boolean;
    isFetching: boolean;
    revalidate: () => Promise<void> | void;
};
export declare const usePlans: (params?: {
    mode: "cache";
}) => {
    data: import("@clerk/shared/index-Be2TJd-S").BillingPlanResource[];
    count: number;
    error: import("@clerk/shared/index-Be2TJd-S").ClerkAPIResponseError | null;
    isLoading: boolean;
    isFetching: boolean;
    isError: boolean;
    page: number;
    pageCount: number;
    fetchPage: (size: number | ((_size: number) => number)) => void;
    fetchPrevious: () => void;
    fetchNext: () => void;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    revalidate: () => Promise<void>;
    setData: (data?: import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPlanResource> | ((currentData?: import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPlanResource> | undefined) => import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPlanResource> | Promise<import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPlanResource> | undefined> | undefined) | undefined) => Promise<import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").BillingPlanResource> | undefined>;
};
type HandleSelectPlanProps = {
    plan: BillingPlanResource;
    planPeriod: BillingSubscriptionPlanPeriod;
    mode?: 'modal' | 'mounted';
    event?: React.MouseEvent<HTMLElement>;
    appearance?: Appearance;
    newSubscriptionRedirectUrl?: string;
};
export declare const usePlansContext: () => {
    activeOrUpcomingSubscription: (plan: BillingPlanResource) => import("@clerk/shared/index-Be2TJd-S").BillingSubscriptionItemResource | undefined;
    activeAndUpcomingSubscriptions: (plan: BillingPlanResource) => import("@clerk/shared/index-Be2TJd-S").BillingSubscriptionItemResource[];
    activeOrUpcomingSubscriptionBasedOnPlanPeriod: (plan: BillingPlanResource, planPeriod?: BillingSubscriptionPlanPeriod) => import("@clerk/shared/index-Be2TJd-S").BillingSubscriptionItemResource | undefined;
    isDefaultPlanImplicitlyActiveOrUpcoming: boolean;
    handleSelectPlan: ({ plan, planPeriod, mode, event, appearance, newSubscriptionRedirectUrl }: HandleSelectPlanProps) => void;
    openSubscriptionDetails: (event?: React.MouseEvent<HTMLElement>) => void;
    buttonPropsForPlan: ({ plan, subscription: sub, isCompact, selectedPlanPeriod, }: {
        plan?: BillingPlanResource;
        subscription?: BillingSubscriptionItemResource;
        isCompact?: boolean;
        selectedPlanPeriod?: BillingSubscriptionPlanPeriod;
    }) => {
        localizationKey: LocalizationKey;
        variant: "bordered" | "solid";
        colorScheme: "secondary" | "primary";
        isDisabled: boolean;
        disabled: boolean;
    };
    canManageSubscription: ({ plan, subscription: sub }: {
        plan?: BillingPlanResource;
        subscription?: BillingSubscriptionItemResource;
    }) => boolean;
    captionForSubscription: (subscription: BillingSubscriptionItemResource) => LocalizationKey | undefined;
    defaultFreePlan: import("@clerk/shared/index-Be2TJd-S").BillingPlanResource | undefined;
    revalidateAll: () => void;
};
export {};
