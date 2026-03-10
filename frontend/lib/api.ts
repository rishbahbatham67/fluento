const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

// ── Types (mirror backend response models exactly) ────────────────────────

export interface MetricScore {
  label: string
  score: number
}

export interface CorrectionItem {
  original:   string
  suggestion: string
  reason:     string
}

export interface EvaluationResponse {
  transcript:        string
  overallScore:      number
  metrics:           MetricScore[]
  strengths:         string[]
  corrections:       CorrectionItem[]
  rewrite:           string | null
  sessionId:         string | null
  detectedLanguage:  string | null
}

export interface HistoryItem {
  id:                string
  topic:             string
  topic_category:    string | null
  practice_type:     string
  duration_seconds:  number | null
  overall_score:     number | null
  created_at:        string
  fluency_score:     number | null
  grammar_score:     number | null
  vocabulary_score:  number | null
  clarity_score:     number | null
  pacing_score:      number | null
  transcript_excerpt: string | null
}

export interface HistoryResponse {
  items:    HistoryItem[]
  total:    number
  limit:    number
  offset:   number
  has_more: boolean
}

export interface MetricAverage {
  label: string
  avg:   number
}

export interface ActivityDay {
  date:      string
  practiced: boolean
  score:     number | null
}

export interface AnalyticsSummary {
  current_streak:  number
  longest_streak:  number
  total_sessions:  number
  average_score:   number | null
  metric_averages: MetricAverage[]
  activity_grid:   ActivityDay[][]
  score_trend:     number[]
}

export interface StreakResponse {
  current_streak:    number
  longest_streak:    number
  total_sessions:    number
  last_session_date: string | null
}

// ── API functions ─────────────────────────────────────────────────────────

export async function uploadAudio(
  audioBlob: Blob,
  topic: string,
  topicCategory?: string,
  practiceType: string = 'topic',
  durationSeconds?: number,
): Promise<EvaluationResponse> {
  const form = new FormData()
  form.append('audio', audioBlob, 'recording.wav')
  form.append('topic', topic)
  if (topicCategory) form.append('topic_category', topicCategory)
  form.append('practice_type', practiceType)
  if (durationSeconds) form.append('duration_seconds', String(durationSeconds))

  const res = await fetch(`${API_BASE}/audio/upload`, {
    method: 'POST',
    body:   form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || `Upload failed with status ${res.status}`)
  }

  return res.json()
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const res = await fetch(`${API_BASE}/analytics/summary`)
  if (!res.ok) throw new Error('Failed to fetch analytics')
  return res.json()
}

export async function getStreak(): Promise<StreakResponse> {
  const res = await fetch(`${API_BASE}/analytics/streak`)
  if (!res.ok) throw new Error('Failed to fetch streak')
  return res.json()
}

export async function getHistory(params?: {
  practice_type?:  string
  topic_category?: string
  limit?:          number
  offset?:         number
}): Promise<HistoryResponse> {
  const query = new URLSearchParams()
  if (params?.practice_type)  query.set('practice_type',  params.practice_type)
  if (params?.topic_category) query.set('topic_category', params.topic_category)
  if (params?.limit)          query.set('limit',          String(params.limit))
  if (params?.offset)         query.set('offset',         String(params.offset))

  const res = await fetch(`${API_BASE}/history?${query.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch history')
  return res.json()
}

export async function getSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}`)
  if (!res.ok) throw new Error('Failed to fetch session')
  return res.json()
}

export interface VocabWord {
  word:       string
  type:       string
  definition: string
  example:    string
}

export interface VocabGenerateResponse {
  words: VocabWord[]
}

export async function generateVocabulary(
  goals:      string,
  difficulty: string,
  count:      number = 12,
): Promise<VocabGenerateResponse> {
  const res = await fetch(`${API_BASE}/topics/vocabulary`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ goals, difficulty, count }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to generate vocabulary')
  }
  return res.json()
}


// ── Structure hints ───────────────────────────────────────────────────────

export interface StructureHint {
  step: string
  hint: string
}

export interface StructureHintsResponse {
  structure: StructureHint[]
  vocab:     string[]
  tip:       string
}

export async function generateHints(
  topic:      string,
  goals:      string,
  difficulty: string,
): Promise<StructureHintsResponse> {
  const res = await fetch(`${API_BASE}/topics/hints`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ topic, goals, difficulty }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to generate hints')
  }
  return res.json()
}

// ── Reading paragraph ─────────────────────────────────────────────────────

export interface ParagraphResponse {
  paragraph:  string
  topic:      string
  word_count: number
  target_wpm: number
}

export async function generateParagraph(
  goals:      string,
  difficulty: string,
  topic?:     string,
): Promise<ParagraphResponse> {
  const res = await fetch(`${API_BASE}/topics/paragraph`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      goals,
      difficulty,
      topic,
      seed: Date.now().toString(),
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to generate paragraph')
  }
  return res.json()
}
