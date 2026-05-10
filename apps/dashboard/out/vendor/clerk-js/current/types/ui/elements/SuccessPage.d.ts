import React from 'react';
import type { Flex } from '../customizables';
import { Button } from '../customizables';
import type { LocalizationKey } from '../localization';
import type { PropsOfComponent } from '../styledSystem';
type SuccessPageProps = Omit<PropsOfComponent<typeof Flex>, 'headerTitle' | 'title'> & {
    title?: LocalizationKey;
    subtitle?: LocalizationKey;
    text?: LocalizationKey | LocalizationKey[];
    finishLabel?: LocalizationKey;
    contents?: React.ReactNode;
    headerBadgeText?: LocalizationKey;
    onFinish?: () => void;
    finishButtonProps?: PropsOfComponent<typeof Button>;
};
export declare const SuccessPage: (props: SuccessPageProps) => import("@emotion/react/jsx-runtime").JSX.Element;
export {};
