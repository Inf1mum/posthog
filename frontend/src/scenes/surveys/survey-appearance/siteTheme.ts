import { hexToRGB } from 'lib/utils/colors'
import { SurveyTheme } from 'scenes/surveys/constants'

import type { SiteStyleApi } from 'products/surveys/frontend/generated/api.schemas'

// WCAG AA minimums: 4.5 for body text, 3 for the edge of a control such as a button.
const READABLE_TEXT_CONTRAST = 4.5
const VISIBLE_CONTROL_CONTRAST = 3
// A pill-shaped site button would turn the survey box into a capsule.
const MAX_BORDER_RADIUS = 16

function relativeLuminance(hex: string): number {
    const { r, g, b } = hexToRGB(hex)
    const linear = (channel: number): number => {
        const c = channel / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrastRatio(a: string, b: string): number {
    const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
    return (lighter + 0.05) / (darker + 0.05)
}

function readableOn(background: string, preferred: string): string {
    if (contrastRatio(preferred, background) >= READABLE_TEXT_CONTRAST) {
        return preferred
    }
    return contrastRatio('#000000', background) >= contrastRatio('#ffffff', background) ? '#000000' : '#ffffff'
}

function mix(from: string, to: string, weight: number): string {
    const a = hexToRGB(from)
    const b = hexToRGB(to)
    const channel = (x: number, y: number): string =>
        Math.round(x + (y - x) * weight)
            .toString(16)
            .padStart(2, '0')
    return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`
}

export function siteTheme(style: SiteStyleApi): SurveyTheme {
    const background = style.background_color
    const text = readableOn(background, style.text_color)
    const button =
        style.button_color && contrastRatio(style.button_color, background) >= VISIBLE_CONTROL_CONTRAST
            ? style.button_color
            : text
    const buttonText = readableOn(
        button,
        button === style.button_color ? (style.button_text_color ?? background) : background
    )

    return {
        id: 'site',
        name: 'Your site',
        description: 'Colors from your site',
        appearance: {
            backgroundColor: background,
            textColor: text,
            borderColor: mix(background, text, 0.15),
            submitButtonColor: button,
            submitButtonTextColor: buttonText,
            ratingButtonColor: mix(background, text, 0.06),
            ratingButtonActiveColor: button,
            inputBackground: background,
            fontFamily: 'inherit',
            ...(style.button_border_radius !== null && {
                borderRadius: `${Math.min(style.button_border_radius, MAX_BORDER_RADIUS)}px`,
            }),
        },
    }
}
