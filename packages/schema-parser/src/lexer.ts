/**
 * Chevrotain-based Prisma Schema Language Lexer
 */

import { createToken, type ILexingError, IToken, Lexer as ChevrotainLexer, type TokenType } from 'chevrotain'

// Category matched by identifiers and by keywords used in identifier position (contextual keywords)
export const IdentifierLike: TokenType = createToken({ name: 'IdentifierLike', pattern: ChevrotainLexer.NA })

// Identifiers and literals - declare first for reference
export const Identifier: TokenType = createToken({
  name: 'Identifier',
  pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
  categories: [IdentifierLike],
})

// Keywords
const keyword = (name: string, pattern: RegExp): TokenType =>
  createToken({ name, pattern, longer_alt: Identifier, categories: [IdentifierLike] })

export const Model: TokenType = keyword('Model', /model/)
export const Enum: TokenType = keyword('Enum', /enum/)
export const DataSource: TokenType = keyword('DataSource', /datasource/)
export const Generator: TokenType = keyword('Generator', /generator/)
export const Type: TokenType = keyword('Type', /type/)
export const View: TokenType = keyword('View', /view/)

export const StringLiteral: TokenType = createToken({
  name: 'StringLiteral',
  pattern: /"(?:[^"\\]|\\.)*"/,
  line_breaks: false,
})
export const NumberLiteral: TokenType = createToken({
  name: 'NumberLiteral',
  pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
})

// Punctuation
export const LBrace: TokenType = createToken({ name: 'LBrace', pattern: /{/ })
export const RBrace: TokenType = createToken({ name: 'RBrace', pattern: /}/ })
export const LParen: TokenType = createToken({ name: 'LParen', pattern: /\(/ })
export const RParen: TokenType = createToken({ name: 'RParen', pattern: /\)/ })
export const LBracket: TokenType = createToken({ name: 'LBracket', pattern: /\[/ })
export const RBracket: TokenType = createToken({ name: 'RBracket', pattern: /\]/ })
export const AtAt: TokenType = createToken({ name: 'AtAt', pattern: /@@/ })
export const At: TokenType = createToken({ name: 'At', pattern: /@/, longer_alt: AtAt })
export const Equals: TokenType = createToken({ name: 'Equals', pattern: /=/ })
export const Question: TokenType = createToken({ name: 'Question', pattern: /\?/ })
export const Comma: TokenType = createToken({ name: 'Comma', pattern: /,/ })
export const Dot: TokenType = createToken({ name: 'Dot', pattern: /\./ })
export const Colon: TokenType = createToken({ name: 'Colon', pattern: /:/ })

// Comments and whitespace
export const SingleLineComment: TokenType = createToken({
  name: 'SingleLineComment',
  pattern: /\/\/[^\r\n]*/,
  group: ChevrotainLexer.SKIPPED,
})

export const MultiLineComment: TokenType = createToken({
  name: 'MultiLineComment',
  pattern: /\/\*[\s\S]*?\*\//,
  group: ChevrotainLexer.SKIPPED,
})

export const WhiteSpace: TokenType = createToken({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: ChevrotainLexer.SKIPPED,
})

// Token list (order matters for precedence)
export const allTokens = [
  WhiteSpace,
  SingleLineComment,
  MultiLineComment,

  // Keywords (must come before Identifier)
  Model,
  Enum,
  DataSource,
  Generator,
  Type,
  View,

  // Literals and identifiers
  NumberLiteral,
  StringLiteral,
  Identifier,
  IdentifierLike,

  // Multi-character punctuation (must come before single-character)
  AtAt,

  // Single-character punctuation
  LBrace,
  RBrace,
  LParen,
  RParen,
  LBracket,
  RBracket,
  At,
  Equals,
  Question,
  Comma,
  Dot,
  Colon,
]

export const SchemaLexer: ChevrotainLexer = new ChevrotainLexer(allTokens, {
  // Uncomment this to see token recognition debug info
  // positionTracking: "full"
})

// Export for external use
export type { IToken }

/**
 * Tokenize a Prisma schema string
 */
export function tokenizeSchema(text: string): { tokens: IToken[]; errors: ILexingError[] } {
  const lexingResult = SchemaLexer.tokenize(text)

  return {
    tokens: lexingResult.tokens,
    errors: lexingResult.errors,
  }
}
