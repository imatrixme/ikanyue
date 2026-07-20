import { convert } from 'html-to-text'
import sanitizeHtml from 'sanitize-html'
import type { Activity } from '../../app/types/content'

const activityHtmlOptions: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noreferrer noopener' }),
  },
}

const activitySummaryLimit = 180

function createActivitySummary(descriptionHtml: string) {
  const summary = convert(descriptionHtml, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true, ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  }).replace(/\s+/g, ' ').trim()

  const characters = Array.from(summary)
  return characters.length > activitySummaryLimit
    ? `${characters.slice(0, activitySummaryLimit - 1).join('').trimEnd()}…`
    : summary
}

export function normalizeActivityContent(activity: Activity): Activity {
  const source = activity.description?.trim() || ''
  const descriptionHtml = source ? sanitizeHtml(source, activityHtmlOptions) : ''

  return {
    ...activity,
    descriptionHtml,
    summary: descriptionHtml ? createActivitySummary(descriptionHtml) : '',
  }
}
