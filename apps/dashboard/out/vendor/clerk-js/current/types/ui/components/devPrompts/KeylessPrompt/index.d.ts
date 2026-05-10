import { type ReactNode } from 'react';
type KeylessPromptProps = {
    claimUrl: string;
    copyKeysUrl: string;
    onDismiss: (() => Promise<unknown>) | undefined | null;
};
export type STATES = 'idle' | 'userCreated' | 'claimed' | 'completed';
/**
 * Determines the current state based on application lifecycle flags.
 * State precedence: completed -> claimed -> userCreated -> idle
 *
 * Note: This is a structural refactor - the actual runtime behavior for
 * `claimed` and `success` is determined by environment state and props.
 * Currently, `claimed` comes from `environment.authConfig.claimedAt` and
 * `success` is derived from `onDismiss` prop presence + claimed state.
 */
export declare function getCurrentState(claimed: boolean, success: boolean, isSignedIn: boolean): STATES;
type ResolvedContentContext = {
    appName: string;
    instanceUrl: string;
    claimUrl: string;
    onDismiss: (() => Promise<unknown>) | undefined | null;
};
type ResolvedContent = {
    state: STATES;
    triggerWidth: string;
    title: string;
    description: ReactNode;
    cta: {
        kind: 'link';
        text: string;
        href: string;
    } | {
        kind: 'action';
        text: string;
        onClick: () => void;
    };
};
/**
 * Gets resolved content from state and context.
 * This is a pure function that can be easily unit tested.
 */
export declare function getResolvedContent(state: STATES, context: ResolvedContentContext): ResolvedContent;
export declare function KeylessPrompt(props: KeylessPromptProps): import("@emotion/react/jsx-runtime").JSX.Element;
export {};
