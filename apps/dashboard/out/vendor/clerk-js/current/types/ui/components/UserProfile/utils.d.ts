import type { EmailAddressResource, PhoneNumberResource, Web3WalletResource } from '@clerk/shared/types';
export { defaultFirst, getSecondFactors, getSecondFactorsAvailableToAdd } from '@/ui/utils/mfa';
type IDable = {
    id: string;
};
export declare const primaryIdentificationFirst: (primaryId: string | null) => (val1: IDable, val2: IDable) => 0 | 1 | -1;
export declare const currentSessionFirst: (id: string) => (a: IDable) => 1 | -1;
export declare function sortIdentificationBasedOnVerification<T extends Array<EmailAddressResource | PhoneNumberResource | Web3WalletResource>>(array: T | null | undefined, primaryId: string | null | undefined): T;
