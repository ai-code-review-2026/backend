import type { NavigateOptions } from '@clerk/shared/types';
import React from 'react';
type HistoryEvent = 'pushstate' | 'replacestate';
type RefreshEvent = keyof WindowEventMap | HistoryEvent;
interface BaseRouterProps {
    basePath: string;
    startPath: string;
    getPath: () => string;
    getQueryString: () => string;
    internalNavigate: (toURL: URL, options?: NavigateOptions) => Promise<any> | any;
    refreshEvents?: Array<RefreshEvent>;
    preservedParams?: string[];
    urlStateParam?: {
        startPath: string;
        path: string;
        componentName: string;
        clearUrlStateParam: () => void;
        socialProvider: string;
    };
    children: React.ReactNode;
}
export declare const BaseRouter: ({ basePath, startPath, getPath, getQueryString, internalNavigate, refreshEvents, preservedParams, urlStateParam, children, }: BaseRouterProps) => JSX.Element;
export {};
