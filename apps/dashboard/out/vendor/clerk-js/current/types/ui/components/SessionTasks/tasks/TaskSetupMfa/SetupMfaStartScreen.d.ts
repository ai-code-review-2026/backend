import type { VerificationStrategy } from '@clerk/shared/types';
type SetupMfaStartScreenProps = {
    availableMethods: VerificationStrategy[];
    goToStep: (step: number) => void;
};
export declare const SetupMfaStartScreen: (props: SetupMfaStartScreenProps) => import("@emotion/react/jsx-runtime").JSX.Element;
export {};
