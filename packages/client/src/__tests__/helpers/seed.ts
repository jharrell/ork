import type { OrkTestClient } from './dialects'

export interface SeedData {
  users: Array<{ id: number; email: string; name: string | null }>
  profiles: Array<{ id: number; bio: string | null; userId: number }>
  posts: Array<{ id: number; title: string; content: string | null; published: boolean; authorId: number }>
}

/**
 * Seed the canonical conformance dataset through the generated client (not raw
 * Kysely), so per-dialect field transforms are applied — notably booleans, which
 * better-sqlite3 refuses to bind as JS `true`/`false`. This keeps the seed
 * dialect-agnostic across PostgreSQL and SQLite.
 */
export async function seedTestData(client: OrkTestClient): Promise<SeedData> {
  const alice = await client.user.create({ data: { email: 'alice@example.com', name: 'Alice' } })
  const bob = await client.user.create({ data: { email: 'bob@example.com', name: 'Bob' } })
  const charlie = await client.user.create({ data: { email: 'charlie@example.com' } })

  const users = [alice, bob, charlie].map((u) => ({ id: u.id, email: u.email, name: u.name ?? null }))

  const aliceProfile = await client.profile.create({
    data: {
      userId: alice.id,
      bio: 'Software developer from San Francisco',
      settings: { theme: 'dark', notifications: true },
    },
  })
  const bobProfile = await client.profile.create({ data: { userId: bob.id } })

  const profiles = [aliceProfile, bobProfile].map((p) => ({ id: p.id, bio: p.bio ?? null, userId: p.userId }))

  const created: SeedData['posts'] = []
  for (const data of [
    {
      title: 'Getting Started with TypeScript',
      content: 'TypeScript is great for type safety...',
      metadata: { tags: ['typescript', 'intro'], wordCount: 1500 },
      published: true,
      authorId: alice.id,
    },
    {
      title: 'Advanced Prisma Patterns',
      content: 'Learn about advanced querying...',
      published: true,
      authorId: alice.id,
    },
    { title: 'Draft Post', content: 'This is a draft...', published: false, authorId: alice.id },
    { title: "Bob's First Post", content: 'Hello world!', published: true, authorId: bob.id },
  ]) {
    const post = await client.post.create({ data })
    created.push({
      id: post.id,
      title: post.title,
      content: post.content ?? null,
      published: post.published,
      authorId: post.authorId,
    })
  }

  return { users, profiles, posts: created }
}
