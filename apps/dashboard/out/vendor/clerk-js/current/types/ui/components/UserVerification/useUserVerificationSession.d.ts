import type { SessionVerificationLevel } from '@clerk/shared/types';
declare const useUserVerificationSessionKey: () => {
    level: SessionVerificationLevel;
};
declare const useUserVerificationSession: () => {
    setCache: (state: import("../../hooks").State<import("@clerk/shared/index-Be2TJd-S").SessionVerificationResource, any> | ((params: import("../../hooks").State<import("@clerk/shared/index-Be2TJd-S").SessionVerificationResource, any>) => import("../../hooks").State<import("@clerk/shared/index-Be2TJd-S").SessionVerificationResource, any>)) => void;
    invalidate: () => void;
    revalidate: () => void;
    data?: import("@clerk/shared/index-Be2TJd-S").SessionVerificationResource | null | undefined;
    error?: any;
    isLoading?: boolean | undefined;
    isValidating?: boolean | undefined;
    cachedAt?: number;
};
declare function withUserVerificationSessionGuard<P>(Component: React.ComponentType<P>): React.ComponentType<P>;
export { useUserVerificationSessionKey, useUserVerificationSession, withUserVerificationSessionGuard };
