import type { Attributes, PhoneNumberResource, UserResource, VerificationStrategy } from '@clerk/shared/types';
export declare const defaultFirst: (a: PhoneNumberResource) => 1 | -1;
export declare function getSecondFactors(attributes: Partial<Attributes>): VerificationStrategy[];
export declare function getSecondFactorsAvailableToAdd(attributes: Partial<Attributes>, user: UserResource): VerificationStrategy[];
