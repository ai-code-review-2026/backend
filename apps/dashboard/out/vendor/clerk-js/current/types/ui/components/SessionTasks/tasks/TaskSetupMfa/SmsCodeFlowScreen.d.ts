import type { PhoneNumberResource, UserResource } from '@clerk/shared/types';
export declare const getAvailablePhonesFromUser: (user: UserResource | undefined | null) => PhoneNumberResource[];
type SmsCodeFlowProps = {
    onSuccess: () => void;
    goToStartStep: () => void;
};
export declare const SmsCodeFlow: (props: SmsCodeFlowProps) => import("@emotion/react/jsx-runtime").JSX.Element;
export {};
