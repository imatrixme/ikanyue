import type { AssessmentTemplate } from './types'

export type AssessmentAnswers = Record<string, string | number | string[]>

export interface ScoreLine {
  sectionKey: string
  label: string
  rawScore: number
  weightedScore: number
}

export interface ScoreResult {
  totalScore: number
  grade: string
  lines: ScoreLine[]
}

export function scoreLocalAssessment(template: AssessmentTemplate, answers: AssessmentAnswers): ScoreResult {
  const scoring = template.scoringJson || template.schemaJson.scoring
  const lines = template.schemaJson.sections.map((section) => {
    const scores = section.items
      .map((item) => {
        const answer = answers[item.key]
        if (item.type === 'single_choice') {
          return Number(item.options?.find((option) => option.value === answer)?.score || 0)
        }
        if (item.type === 'multi_choice') {
          const selected = Array.isArray(answer) ? answer : []
          return (item.options || [])
            .filter((option) => selected.includes(option.value))
            .reduce((sum, option) => sum + Number(option.score || 0), 0)
        }
        if (item.type === 'score_slider' || item.type === 'number_score') {
          return Number(answer || 0)
        }
        return null
      })
      .filter((score): score is number => score !== null)
    const rawScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
    return {
      sectionKey: section.key,
      label: section.title,
      rawScore: round(rawScore),
      weightedScore: round(rawScore * Number(section.weight || 0)),
    }
  })
  const totalScore = scoring.type === 'rubric_sum'
    ? Math.min(Number(scoring.maxScore || 100), lines.reduce((sum, line) => sum + line.rawScore, 0))
    : lines.reduce((sum, line) => sum + line.weightedScore, 0)
  const rounded = round(totalScore)
  return { totalScore: rounded, grade: resolveGrade(rounded, scoring.gradeBands), lines }
}

function resolveGrade(score: number, gradeBands: Array<{ min: number; label: string }>): string {
  const band = [...gradeBands].sort((a, b) => b.min - a.min).find((candidate) => score >= candidate.min)
  return band?.label || ''
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
