import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { api } from '../../api'
import { qk } from '../../api/queryKeys'
import type { Comment, Member, PublicUser } from '../../api/types'
import { timeAgo } from '../../app/format'
import { Avatar } from '../../components/Avatar'
import { ErrorState, InlineError, LoadingState } from '../../components/States'
import styles from './tasks.module.css'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Highlights "@Full Name" for every user actually mentioned in the comment. */
function renderBody(comment: Comment, members: Member[]): ReactNode {
  const names = comment.mentionIds.map((id) => members.find((m) => m.user.id === id)?.user.name).filter((n): n is string => !!n)
  if (names.length === 0) return comment.body
  const pattern = new RegExp(`(${names.map((n) => `@${escape(n)}`).join('|')})`, 'g')
  return comment.body.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className={styles.mention}>
        {part}
      </span>
    ) : (
      part
    ),
  )
}

export function Comments({ taskId, members, canComment }: { taskId: string; members: Member[]; canComment: boolean }) {
  const qc = useQueryClient()
  const comments = useQuery({ queryKey: qk.comments(taskId), queryFn: () => api.comments.list(taskId) })
  const [body, setBody] = useState('')
  const [mentioned, setMentioned] = useState<PublicUser[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)

  const suggestions =
    mentionQuery === null ? [] : members.filter((m) => m.user.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)

  const create = useMutation({
    mutationFn: () => {
      const mentionIds = mentioned.filter((u) => body.includes(`@${u.name}`)).map((u) => u.id)
      return api.comments.create(taskId, { body, mentionIds })
    },
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(qk.comments(taskId), (list) => (list && !list.some((c) => c.id === comment.id) ? [...list, comment] : list))
      setBody('')
      setMentioned([])
    },
  })

  const updateMentionQuery = (text: string, caret: number) => {
    const match = /(?:^|\s)@([^\s@]*(?: [^\s@]*)?)$/.exec(text.slice(0, caret))
    setMentionQuery(match ? match[1] : null)
    setActive(0)
  }

  const pick = (user: PublicUser, textarea: HTMLTextAreaElement | null) => {
    const caret = textarea?.selectionStart ?? body.length
    const before = body.slice(0, caret).replace(/@([^\s@]*(?: [^\s@]*)?)$/, `@${user.name} `)
    const next = before + body.slice(caret)
    setBody(next)
    setMentioned((list) => (list.some((u) => u.id === user.id) ? list : [...list, user]))
    setMentionQuery(null)
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(before.length, before.length)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (a + 1) % suggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a - 1 + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(suggestions[active].user, e.currentTarget)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (body.trim()) create.mutate()
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (body.trim()) create.mutate()
  }

  return (
    <section className={styles.section} aria-labelledby={`comments-${taskId}`}>
      <h3 id={`comments-${taskId}`}>Comments</h3>
      {comments.isPending && <LoadingState label="Loading comments…" />}
      {comments.isError && <ErrorState error={comments.error} onRetry={() => comments.refetch()} />}
      {comments.data?.length === 0 && <p className="muted">No comments yet.</p>}
      {comments.data && comments.data.length > 0 && (
        <ol className={styles.comments}>
          {comments.data.map((c) => (
            <li key={c.id}>
              <Avatar name={c.author.name} size={28} />
              <div>
                <p className={styles.commentMeta}>
                  <strong>{c.author.name}</strong>{' '}
                  <time className="muted" dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>
                    {timeAgo(c.createdAt)}
                  </time>
                </p>
                <p className={styles.commentBody}>{renderBody(c, members)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {canComment ? (
        <form onSubmit={submit} className={styles.composer}>
          <label htmlFor={`comment-${taskId}`} className="visually-hidden">
            Write a comment
          </label>
          <div className={styles.composerBox}>
            <textarea
              id={`comment-${taskId}`}
              className="input"
              placeholder="Write a comment… Type @ to mention a teammate. Ctrl+Enter to send."
              value={body}
              maxLength={2000}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
              aria-controls={`mentions-${taskId}`}
              aria-activedescendant={suggestions.length > 0 ? `mention-${taskId}-${active}` : undefined}
              onChange={(e) => {
                setBody(e.target.value)
                updateMentionQuery(e.target.value, e.target.selectionStart)
              }}
              onKeyDown={onKeyDown}
              onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
            />
            {suggestions.length > 0 && (
              <ul id={`mentions-${taskId}`} role="listbox" className={styles.suggestions}>
                {suggestions.map((m, i) => (
                  <li
                    key={m.user.id}
                    id={`mention-${taskId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? styles.suggestionActive : undefined}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(m.user, document.getElementById(`comment-${taskId}`) as HTMLTextAreaElement)
                    }}
                  >
                    <Avatar name={m.user.name} size={20} /> {m.user.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <InlineError error={create.error} />
          <div>
            <button className="btn btn--primary btn--sm" disabled={create.isPending || !body.trim()}>
              {create.isPending ? 'Posting…' : 'Comment'}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">Viewers can read comments but cannot post.</p>
      )}
    </section>
  )
}
