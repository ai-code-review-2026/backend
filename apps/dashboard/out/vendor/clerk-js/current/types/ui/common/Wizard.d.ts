import React from 'react';
type WizardProps = React.PropsWithChildren<{
    step: number;
    animate?: boolean;
}>;
type UseWizardProps = {
    defaultStep?: number;
    onNextStep?: () => void;
};
export declare const useWizard: (params?: UseWizardProps) => {
    nextStep: () => void;
    prevStep: () => void;
    goToStep: (i: number) => void;
    props: {
        step: number;
    };
};
export declare const Wizard: (props: WizardProps) => string | number | Iterable<React.ReactNode> | import("@emotion/react/jsx-runtime").JSX.Element;
export {};
