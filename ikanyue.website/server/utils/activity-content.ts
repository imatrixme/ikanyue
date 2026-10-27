import { parseFragment } from 'parse5'
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

interface HtmlNode {
  nodeName: string
  tagName?: string
  value?: string
  childNodes?: HtmlNode[]
}

const blockTags = new Set(['p', 'br', 'div', 'li', 'ul', 'ol', 'section', 'article', 'header', 'footer'])

function extractText(descriptionHtml: string) {
  const chunks: string[] = []

  const visit = (node: HtmlNode) => {
    if (node.nodeName === '#text') {
      chunks.push(node.value || '')
      return
    }

    const separatesText = Boolean(node.tagName && blockTags.has(node.tagName))
    if (separatesText) chunks.push(' ')
    node.childNodes?.forEach(visit)
    if (separatesText) chunks.push(' ')
  }

  visit(parseFragment(descriptionHtml) as unknown as HtmlNode)
  return chunks.join('').replace(/\s+/g, ' ').trim()
}

function createActivitySummary(descriptionHtml: string) {
  const summary = extractText(descriptionHtml)

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
