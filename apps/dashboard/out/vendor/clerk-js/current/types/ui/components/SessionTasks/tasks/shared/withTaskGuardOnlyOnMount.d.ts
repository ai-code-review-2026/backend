import type { SessionTask } from '@clerk/shared/types';
import type { ComponentType } from 'react';
import type { AvailableComponentProps } from '@/ui/types';
/**
 * Triggers a redirect if current task is not the given task key on initial mount only.
 *
 * Unlike the standard withTaskGuard, this guard captures the redirect condition on mount
 * and does not re-evaluate it on subsequent renders. This allows tasks like setup-mfa to continue
 * to still show the success screen after the task is completed mid-flow.
 *
 * If there's a current session, it will redirect to the `redirectUrlComplete` prop.
 * If there's no current session, it will redirect to the sign in URL.
 *
 * @internal
 */
export declare const withTaskGuardOnlyOnMount: <P extends AvailableComponentProps>(Component: ComponentType<P>, taskKey: SessionTask["key"]) => ((props: P) => null | JSX.Element);
