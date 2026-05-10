import type { UserResource } from '@clerk/shared/types';
type UseMultipleSessionsParam = {
    user: UserResource | null | undefined;
};
declare const useMultipleSessions: (params: UseMultipleSessionsParam) => {
    signedInSessions: import("@clerk/shared/index-Be2TJd-S").SignedInSessionResource[];
    otherSessions: import("@clerk/shared/index-Be2TJd-S").SignedInSessionResource[];
};
export { useMultipleSessions };
