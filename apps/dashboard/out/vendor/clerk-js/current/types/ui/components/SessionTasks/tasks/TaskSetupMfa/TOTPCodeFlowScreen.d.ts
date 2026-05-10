import type { TOTPResource } from '@clerk/shared/types';
import React from 'react';
type VerifyTOTPProps = {
    onSuccess: () => void;
    onReset: () => void;
    resourceRef: React.MutableRefObject<TOTPResource | undefined>;
};
type AddAuthenticatorAppProps = {
    onSuccess: () => void;
    onReset: () => void;
};
export declare const AddAuthenticatorApp: (props: AddAuthenticatorAppProps) => import("@emotion/react/jsx-runtime").JSX.Element;
export declare const VerifyTOTP: (props: VerifyTOTPProps) => import("@emotion/react/jsx-runtime").JSX.Element;
type TOTPCodeFlowProps = {
    onSuccess: () => void;
    goToStartStep: () => void;
};
export declare const TOTPCodeFlow: (props: TOTPCodeFlowProps) => import("@emotion/react/jsx-runtime").JSX.Element;
export {};
