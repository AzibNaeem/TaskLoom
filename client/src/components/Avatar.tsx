import styles from './Avatar.module.css'

const palette = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink']

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const color = `var(--label-${palette[hash % palette.length]})`
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.4, borderColor: color, color }} title={name} aria-hidden="true">
      {initials(name)}
    </span>
  )
}
