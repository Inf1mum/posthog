import clsx from 'clsx'
import { useValues } from 'kea'
import { useState } from 'react'

import { IconBrowser } from '@posthog/icons'
import { Spinner } from '@posthog/lemon-ui'

import { NewSurvey, SurveyTheme } from 'scenes/surveys/constants'
import { ThemePreviewCard } from 'scenes/surveys/wizard/SurveyThemeSelector'

import { Survey, SurveyAppearance, SurveyType } from '~/types'

import {
    siteSnapshotUrlCondition,
    surveySiteSnapshotLogic,
} from 'products/surveys/frontend/draftReview/surveySiteSnapshotLogic'

import { siteTheme } from './siteTheme'

interface SiteThemeCardProps {
    survey: Survey | NewSurvey
    appearance: SurveyAppearance
    onSelectTheme: (theme: SurveyTheme) => void
    disabled?: boolean
}

function PlaceholderCard({
    description,
    onClick,
    loading,
    disabled,
}: {
    description: string
    onClick?: () => void
    loading?: boolean
    disabled?: boolean
}): JSX.Element {
    const interactive = !!onClick && !disabled
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!interactive}
            className={clsx(
                'flex flex-col rounded-lg border-2 border-dashed border-border bg-bg-light p-2 text-left',
                interactive ? 'hover:border-primary/50' : 'cursor-default',
                disabled && 'opacity-50'
            )}
        >
            <div className="mb-1.5 flex h-14 w-full items-center justify-center rounded border text-2xl text-secondary">
                {loading ? <Spinner /> : <IconBrowser />}
            </div>
            <span className="text-sm font-medium">Match my site</span>
            <span className="text-xs text-muted">{description}</span>
        </button>
    )
}

function rendersOnSite(survey: Survey | NewSurvey): survey is Survey {
    return survey.id !== 'new' && [SurveyType.Popover, SurveyType.Widget].includes(survey.type)
}

function LoadedSiteThemeCard({
    survey,
    appearance,
    onSelectTheme,
    disabled,
}: SiteThemeCardProps & { survey: Survey }): JSX.Element {
    const { siteSnapshot } = useValues(
        surveySiteSnapshotLogic({
            surveyId: survey.id,
            device: 'desktop',
            urlCondition: siteSnapshotUrlCondition(survey.conditions),
        })
    )

    if (!siteSnapshot || siteSnapshot.status === 'rendering') {
        return <PlaceholderCard description="Reading your site…" loading />
    }
    if (siteSnapshot.status === 'unavailable') {
        return <PlaceholderCard description="No recent recording of this page" />
    }
    if (!siteSnapshot.site_style) {
        return <PlaceholderCard description="Couldn't read your site's colors" />
    }
    const theme = siteTheme(siteSnapshot.site_style)
    return (
        <ThemePreviewCard
            theme={theme}
            isSelected={
                appearance.backgroundColor === theme.appearance.backgroundColor &&
                appearance.submitButtonColor === theme.appearance.submitButtonColor
            }
            onClick={() => onSelectTheme(theme)}
            disabled={disabled}
        />
    )
}

export function SiteThemeCard(props: SiteThemeCardProps): JSX.Element | null {
    const [requested, setRequested] = useState(false)

    if (!rendersOnSite(props.survey)) {
        return null
    }
    return requested ? (
        <LoadedSiteThemeCard {...props} survey={props.survey} />
    ) : (
        <PlaceholderCard
            description="Use your site's colors"
            onClick={() => setRequested(true)}
            disabled={props.disabled}
        />
    )
}
