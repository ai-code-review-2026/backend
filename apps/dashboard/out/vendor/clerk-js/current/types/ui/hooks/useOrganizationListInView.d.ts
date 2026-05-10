/**
 * @internal
 */
export declare const useOrganizationListInView: () => {
    userMemberships: {
        data: undefined;
        count: undefined;
        error: undefined;
        isLoading: false;
        isFetching: false;
        isError: false;
        page: undefined;
        pageCount: undefined;
        fetchPage: undefined;
        fetchPrevious: undefined;
        fetchNext: undefined;
        hasNextPage: false;
        hasPreviousPage: false;
        revalidate: undefined;
        setData: undefined;
    } | {
        data: import("@clerk/shared/index-Be2TJd-S").OrganizationMembershipResource[];
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
        setData: (data?: (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationMembershipResource> | undefined)[] | ((currentData?: (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationMembershipResource> | undefined)[] | undefined) => (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationMembershipResource> | undefined)[] | Promise<(import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationMembershipResource> | undefined)[] | undefined> | undefined) | undefined) => Promise<(import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationMembershipResource> | undefined)[] | undefined>;
    };
    userInvitations: {
        data: undefined;
        count: undefined;
        error: undefined;
        isLoading: false;
        isFetching: false;
        isError: false;
        page: undefined;
        pageCount: undefined;
        fetchPage: undefined;
        fetchPrevious: undefined;
        fetchNext: undefined;
        hasNextPage: false;
        hasPreviousPage: false;
        revalidate: undefined;
        setData: undefined;
    } | {
        data: import("@clerk/shared/index-Be2TJd-S").UserOrganizationInvitationResource[];
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
        setData: (data?: (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").UserOrganizationInvitationResource> | undefined)[] | ((currentData?: (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").UserOrganizationInvitationResource> | undefined)[] | undefined) => (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").UserOrganizationInvitationResource> | undefined)[] | Promise<(import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").UserOrganizationInvitationResource> | undefined)[] | undefined> | undefined) | undefined) => Promise<(import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").UserOrganizationInvitationResource> | undefined)[] | undefined>;
    };
    userSuggestions: {
        data: undefined;
        count: undefined;
        error: undefined;
        isLoading: false;
        isFetching: false;
        isError: false;
        page: undefined;
        pageCount: undefined;
        fetchPage: undefined;
        fetchPrevious: undefined;
        fetchNext: undefined;
        hasNextPage: false;
        hasPreviousPage: false;
        revalidate: undefined;
        setData: undefined;
    } | {
        data: import("@clerk/shared/index-Be2TJd-S").OrganizationSuggestionResource[];
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
        setData: (data?: (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationSuggestionResource> | undefined)[] | ((currentData?: (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationSuggestionResource> | undefined)[] | undefined) => (import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationSuggestionResource> | undefined)[] | Promise<(import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationSuggestionResource> | undefined)[] | undefined> | undefined) | undefined) => Promise<(import("@clerk/shared/index-Be2TJd-S").ClerkPaginatedResponse<import("@clerk/shared/index-Be2TJd-S").OrganizationSuggestionResource> | undefined)[] | undefined>;
    };
    ref: (element: HTMLElement | null) => void;
};
