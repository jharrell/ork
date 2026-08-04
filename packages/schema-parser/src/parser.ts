/**
 * Chevrotain-based Prisma Schema Language Parser
 */

import type {
  CstChildrenDictionary,
  CstElement,
  CstNode,
  CstNodeLocation,
  ICstVisitor,
  IRecognitionException,
  IToken,
  ParserMethod,
} from 'chevrotain'
import { CstParser } from 'chevrotain'

import {
  allTokens,
  At,
  AtAt,
  Colon,
  Comma,
  DataSource,
  Dot,
  Enum,
  Equals,
  Generator,
  IdentifierLike,
  LBrace,
  LBracket,
  LParen,
  Model,
  NumberLiteral,
  Question,
  RBrace,
  RBracket,
  RParen,
  StringLiteral,
  tokenizeSchema,
  Type,
  View,
} from './lexer.js'
import type {
  ArrayElementAST,
  AttributeArgumentAST,
  AttributeAST,
  AttributeValue,
  DataSourceAST,
  EnumAST,
  EnumValueAST,
  FieldAST,
  FieldType,
  GeneratorAST,
  ModelAST,
  ParseResult,
  SchemaAST,
  TypeAST,
  ViewAST,
} from './types.js'

type CstChildren = CstChildrenDictionary
type CstNodeArray = CstNode[]

const DEFAULT_POSITION = { line: 1, column: 1, offset: 0 }

export const UNSUPPORTED_TYPE = 'Unsupported'

function isToken(element: CstElement): element is IToken {
  return 'image' in element
}

function isCstNode(element: CstElement): element is CstNode {
  return 'name' in element
}

function getChildElements(children: CstChildren, name: string): CstElement[] {
  return children[name] ?? []
}

function getNodes(children: CstChildren, name: string): CstNodeArray {
  return getChildElements(children, name).filter(isCstNode)
}

function getTokens(children: CstChildren, name: string): IToken[] {
  return getChildElements(children, name).filter(isToken)
}

function getTokenImage(children: CstChildren, name: string): string {
  const token = getTokens(children, name)[0]
  return token?.image ?? ''
}

function spanFromLocation(location?: CstNodeLocation) {
  return {
    start: {
      line: location?.startLine ?? DEFAULT_POSITION.line,
      column: location?.startColumn ?? DEFAULT_POSITION.column,
      offset: location?.startOffset ?? DEFAULT_POSITION.offset,
    },
    end: {
      line: location?.endLine ?? location?.startLine ?? DEFAULT_POSITION.line,
      column: location?.endColumn ?? location?.startColumn ?? DEFAULT_POSITION.column,
      offset: location?.endOffset ?? location?.startOffset ?? DEFAULT_POSITION.offset,
    },
  }
}

function coordinate(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

// Chevrotain's EOF token carries NaN coordinates, so positions must be validated, not just defaulted.
function isPositioned(token?: IToken): token is IToken {
  return token !== undefined && Number.isFinite(token.startLine)
}

function spanFromToken(token?: IToken) {
  if (!token) {
    return { start: DEFAULT_POSITION, end: DEFAULT_POSITION }
  }
  const start = {
    line: coordinate(token.startLine, DEFAULT_POSITION.line),
    column: coordinate(token.startColumn, DEFAULT_POSITION.column),
    offset: coordinate(token.startOffset, DEFAULT_POSITION.offset),
  }
  return {
    start,
    end: {
      line: coordinate(token.endLine, start.line),
      column: coordinate(token.endColumn, start.column),
      offset: coordinate(token.endOffset, start.offset),
    },
  }
}

function hasPreviousToken(error: IRecognitionException): error is IRecognitionException & { previousToken: IToken } {
  return 'previousToken' in error
}

function spanFromRecognitionError(error: IRecognitionException) {
  if (!isPositioned(error.token)) {
    // Error at EOF: report at the end of the last consumed token.
    const end = spanFromToken(hasPreviousToken(error) ? error.previousToken : undefined).end
    return { start: end, end }
  }
  const resyncedTokens = (error.resyncedTokens ?? []).filter(isPositioned)
  const endToken = resyncedTokens.length ? resyncedTokens[resyncedTokens.length - 1] : error.token
  return {
    start: spanFromToken(error.token).start,
    end: spanFromToken(endToken).end,
  }
}

function parseScalar(token: IToken): string | number | boolean {
  if (token.tokenType.name === 'StringLiteral') {
    return parseStringLiteral(token.image)
  }
  if (token.tokenType.name === 'NumberLiteral') {
    return Number(token.image)
  }
  if (token.image === 'true') {
    return true
  }
  if (token.image === 'false') {
    return false
  }
  return token.image
}

function parseStringLiteral(str: string): string {
  return str.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

export class Parser extends CstParser {
  constructor() {
    super(allTokens, {
      recoveryEnabled: true,
      nodeLocationTracking: 'full',
    })

    this.performSelfAnalysis()
  }

  // Root rule
  schema: ParserMethod<[], CstNode> = this.RULE('schema', () => {
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.dataSource) },
        { ALT: () => this.SUBRULE(this.generator) },
        { ALT: () => this.SUBRULE(this.model) },
        { ALT: () => this.SUBRULE(this.typeDeclaration) },
        { ALT: () => this.SUBRULE(this.viewDeclaration) },
        { ALT: () => this.SUBRULE(this.enumDeclaration) },
      ])
    })
  })

  // DataSource declaration
  dataSource: ParserMethod<[], CstNode> = this.RULE('dataSource', () => {
    this.CONSUME(DataSource)
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.SUBRULE(this.configBlock)
  })

  // Generator declaration
  generator: ParserMethod<[], CstNode> = this.RULE('generator', () => {
    this.CONSUME(Generator)
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.SUBRULE(this.configBlock)
  })

  // Shared config block (used in datasource and generator)
  configBlock: ParserMethod<[], CstNode> = this.RULE('configBlock', () => {
    this.CONSUME(LBrace)
    this.MANY(() => {
      this.SUBRULE(this.configProperty)
    })
    this.CONSUME(RBrace)
  })

  // Config property (used in datasource and generator)
  configProperty: ParserMethod<[], CstNode> = this.RULE('configProperty', () => {
    this.CONSUME(IdentifierLike, { LABEL: 'key' })
    this.CONSUME(Equals)
    this.SUBRULE(this.configValue)
  })

  configValue: ParserMethod<[], CstNode> = this.RULE('configValue', () => {
    this.OR([
      { ALT: () => this.CONSUME(StringLiteral, { LABEL: 'value' }) },
      { ALT: () => this.CONSUME(NumberLiteral, { LABEL: 'value' }) },
      { ALT: () => this.SUBRULE(this.functionCall) },
      { ALT: () => this.SUBRULE(this.arrayValue) },
      { ALT: () => this.CONSUME(IdentifierLike, { LABEL: 'value' }) },
    ])
  })

  // Function call like env("DATABASE_URL") or cuid()
  functionCall: ParserMethod<[], CstNode> = this.RULE('functionCall', () => {
    this.CONSUME(IdentifierLike, { LABEL: 'functionName' })
    this.CONSUME(LParen)
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(StringLiteral, { LABEL: 'argument' }) },
        { ALT: () => this.CONSUME(NumberLiteral, { LABEL: 'argument' }) },
        { ALT: () => this.CONSUME2(IdentifierLike, { LABEL: 'argument' }) },
      ])
    })
    this.CONSUME(RParen)
  })

  // Model declaration
  model: ParserMethod<[], CstNode> = this.RULE('model', () => {
    this.CONSUME(Model)
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.SUBRULE(this.modelBody)
  })

  typeDeclaration: ParserMethod<[], CstNode> = this.RULE('typeDeclaration', () => {
    this.CONSUME(Type)
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.SUBRULE(this.modelBody)
  })

  viewDeclaration: ParserMethod<[], CstNode> = this.RULE('viewDeclaration', () => {
    this.CONSUME(View)
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.SUBRULE(this.modelBody)
  })

  modelBody: ParserMethod<[], CstNode> = this.RULE('modelBody', () => {
    this.CONSUME(LBrace)
    this.MANY(() => {
      this.OR([{ ALT: () => this.SUBRULE(this.field) }, { ALT: () => this.SUBRULE(this.modelAttribute) }])
    })
    this.CONSUME(RBrace)
  })

  // Field declaration
  field: ParserMethod<[], CstNode> = this.RULE('field', () => {
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.SUBRULE(this.fieldTypeRef)

    // Optional field modifiers
    this.OPTION(() => {
      this.OR([
        { ALT: () => this.CONSUME(Question) }, // Optional field
        {
          ALT: () => {
            // Array field
            this.CONSUME(LBracket)
            this.CONSUME(RBracket)
          },
        },
      ])
    })

    // Field attributes
    this.MANY(() => {
      this.SUBRULE(this.fieldAttribute)
    })
  })

  // Field type: a plain type name or Unsupported("db type")
  fieldTypeRef: ParserMethod<[], CstNode> = this.RULE('fieldTypeRef', () => {
    this.OR([
      {
        // Gated so that other names followed by "(" stay syntax errors.
        GATE: () => this.LA(1).image === UNSUPPORTED_TYPE && this.LA(2).tokenType === LParen,
        ALT: () => {
          this.CONSUME(IdentifierLike, { LABEL: 'name' })
          this.CONSUME(LParen)
          this.CONSUME(StringLiteral, { LABEL: 'unsupportedType' })
          this.CONSUME(RParen)
        },
      },
      { ALT: () => this.CONSUME2(IdentifierLike, { LABEL: 'name' }) },
    ])
  })

  // Field attribute (@id, @unique, @db.VarChar, etc.)
  fieldAttribute: ParserMethod<[], CstNode> = this.RULE('fieldAttribute', () => {
    this.CONSUME(At)
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.OPTION1(() => {
      this.CONSUME(Dot)
      this.CONSUME2(IdentifierLike, { LABEL: 'nativeTypeName' })
    })
    this.OPTION2(() => {
      this.SUBRULE(this.attributeArguments)
    })
  })

  // Model attribute (@@id, @@unique, etc.)
  modelAttribute: ParserMethod<[], CstNode> = this.RULE('modelAttribute', () => {
    this.CONSUME(AtAt)
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.OPTION1(() => {
      this.CONSUME(Dot)
      this.CONSUME2(IdentifierLike, { LABEL: 'nativeTypeName' })
    })
    this.OPTION2(() => {
      this.SUBRULE(this.attributeArguments)
    })
  })

  // Attribute arguments
  attributeArguments: ParserMethod<[], CstNode> = this.RULE('attributeArguments', () => {
    this.CONSUME(LParen)
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => {
        this.SUBRULE(this.attributeArgument)
      },
    })
    this.CONSUME(RParen)
  })

  // Single attribute argument
  attributeArgument: ParserMethod<[], CstNode> = this.RULE('attributeArgument', () => {
    // Named argument (name: value) or positional argument
    this.OPTION(() => {
      this.CONSUME(IdentifierLike, { LABEL: 'name' })
      this.CONSUME(Colon)
    })

    this.OR([
      { ALT: () => this.CONSUME(StringLiteral, { LABEL: 'value' }) },
      { ALT: () => this.CONSUME(NumberLiteral, { LABEL: 'value' }) },
      { ALT: () => this.SUBRULE(this.functionCall) }, // Support function calls like cuid()
      { ALT: () => this.CONSUME2(IdentifierLike, { LABEL: 'value' }) },
      { ALT: () => this.SUBRULE(this.arrayValue) }, // Support array values like [userId]
    ])
  })

  // Array value for @relation attributes
  arrayValue: ParserMethod<[], CstNode> = this.RULE('arrayValue', () => {
    this.CONSUME(LBracket)
    this.MANY_SEP({
      SEP: Comma,
      DEF: () => {
        this.SUBRULE(this.arrayElement)
      },
    })
    this.CONSUME(RBracket)
  })

  arrayElement: ParserMethod<[], CstNode> = this.RULE('arrayElement', () => {
    this.OR([
      { ALT: () => this.CONSUME(StringLiteral, { LABEL: 'element' }) },
      { ALT: () => this.CONSUME(NumberLiteral, { LABEL: 'element' }) },
      {
        ALT: () => {
          this.CONSUME(IdentifierLike, { LABEL: 'element' })
          // Per-field index modifiers: [title(sort: Desc), body(ops: raw("gin_trgm_ops"))]
          this.OPTION(() => {
            this.SUBRULE(this.attributeArguments)
          })
        },
      },
    ])
  })

  // Enum declaration
  enumDeclaration: ParserMethod<[], CstNode> = this.RULE('enumDeclaration', () => {
    this.CONSUME(Enum)
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.CONSUME(LBrace)
    this.MANY(() => {
      this.OR([{ ALT: () => this.SUBRULE(this.enumValue) }, { ALT: () => this.SUBRULE(this.modelAttribute) }])
    })
    this.CONSUME(RBrace)
  })

  // Enum value
  enumValue: ParserMethod<[], CstNode> = this.RULE('enumValue', () => {
    this.CONSUME(IdentifierLike, { LABEL: 'name' })
    this.MANY(() => {
      this.SUBRULE(this.fieldAttribute) // Enum values can have attributes
    })
  })
}

// CST Visitor for converting CST to AST
type ConfigProperty = { key: string; value: AttributeValue }

export class SchemaVisitor implements ICstVisitor<unknown, unknown> {
  constructor(private parser: Parser) {}

  validateVisitor(): void {
    this.parser.getBaseCstVisitorConstructorWithDefaults()
  }

  schema(node: CstNode): SchemaAST {
    const children = node.children
    const datasources = getNodes(children, 'dataSource').map((child) => this.dataSource(child))
    const generators = getNodes(children, 'generator').map((child) => this.generator(child))
    const models = getNodes(children, 'model').map((child) => this.model(child))
    const types = getNodes(children, 'typeDeclaration').map((child) => this.typeDeclaration(child))
    const views = getNodes(children, 'viewDeclaration').map((child) => this.viewDeclaration(child))
    const enums = getNodes(children, 'enumDeclaration').map((child) => this.enumDeclaration(child))

    return {
      type: 'Schema',
      span: this.getSpan(node),
      datasources,
      generators,
      models,
      types,
      views,
      enums,
    }
  }

  dataSource(node: CstNode): DataSourceAST {
    const children = node.children
    const name = getTokenImage(children, 'name')
    const configBlock = getNodes(children, 'configBlock')[0]
    const properties = configBlock
      ? getNodes(configBlock.children, 'configProperty').map((child) => this.configProperty(child))
      : []

    let provider = ''
    let url = ''

    for (const prop of properties) {
      if (prop.key === 'provider' && typeof prop.value === 'string') {
        provider = prop.value
      } else if (prop.key === 'url' && typeof prop.value === 'string') {
        url = prop.value
      }
    }

    return {
      type: 'DataSource',
      span: this.getSpan(node),
      name,
      provider,
      url,
    }
  }

  generator(node: CstNode): GeneratorAST {
    const children = node.children
    const name = getTokenImage(children, 'name')
    const configBlock = getNodes(children, 'configBlock')[0]
    const properties = configBlock
      ? getNodes(configBlock.children, 'configProperty').map((child) => this.configProperty(child))
      : []

    let provider = ''
    let output: string | undefined

    for (const prop of properties) {
      if (prop.key === 'provider' && typeof prop.value === 'string') {
        provider = prop.value
      } else if (prop.key === 'output' && typeof prop.value === 'string') {
        output = prop.value
      }
    }

    return {
      type: 'Generator',
      span: this.getSpan(node),
      name,
      provider,
      output,
    }
  }

  configProperty(node: CstNode): ConfigProperty {
    const children = node.children
    const key = getTokenImage(children, 'key')
    const valueNode = getNodes(children, 'configValue')[0]
    const value = valueNode ? this.configValue(valueNode) : ''

    return { key, value }
  }

  configValue(node: CstNode): AttributeValue {
    const children = node.children
    const valueToken = getTokens(children, 'value')[0]
    if (valueToken) {
      return parseScalar(valueToken)
    }
    const functionNode = getNodes(children, 'functionCall')[0]
    if (functionNode) {
      return this.functionCall(functionNode)
    }
    const arrayNode = getNodes(children, 'arrayValue')[0]
    if (arrayNode) {
      return this.arrayValue(arrayNode)
    }
    return ''
  }

  functionCall(node: CstNode): string {
    const children = node.children
    const functionName = getTokenImage(children, 'functionName')
    const argumentToken = getTokens(children, 'argument')[0]
    if (argumentToken) {
      if (argumentToken.tokenType.name === 'StringLiteral') {
        const argument = parseStringLiteral(argumentToken.image)
        return `${functionName}("${argument}")`
      }
      return `${functionName}(${argumentToken.image})`
    }
    return `${functionName}()`
  }

  model(node: CstNode): ModelAST {
    const parsed = this.buildModelLike(node, 'Model')
    return { ...parsed, type: 'Model' }
  }

  typeDeclaration(node: CstNode): TypeAST {
    const parsed = this.buildModelLike(node, 'Type')
    return { ...parsed, type: 'Type' }
  }

  viewDeclaration(node: CstNode): ViewAST {
    const parsed = this.buildModelLike(node, 'View')
    return { ...parsed, type: 'View' }
  }

  field(node: CstNode): FieldAST {
    const children = node.children
    const name = getTokenImage(children, 'name')
    const typeRefNode = getNodes(children, 'fieldTypeRef')[0]
    const typeRef = typeRefNode ? this.fieldTypeRef(typeRefNode) : { name: '' }
    const isOptional = getTokens(children, 'Question').length > 0
    const isList = getTokens(children, 'LBracket').length > 0
    const attributes = getNodes(children, 'fieldAttribute').map((child) => this.fieldAttribute(child))

    return {
      type: 'Field',
      span: this.getSpan(node),
      name,
      fieldType: typeRef.name,
      isOptional,
      isList,
      attributes,
      ...(typeRef.unsupportedType === undefined ? {} : { unsupportedType: typeRef.unsupportedType }),
    }
  }

  fieldTypeRef(node: CstNode): { name: FieldType; unsupportedType?: string } {
    const children = node.children
    const unsupportedType = getTokens(children, 'unsupportedType')[0]
    return {
      name: getTokenImage(children, 'name'),
      unsupportedType: unsupportedType ? parseStringLiteral(unsupportedType.image) : undefined,
    }
  }

  fieldAttribute(node: CstNode): AttributeAST {
    return this.buildAttribute(node)
  }

  modelAttribute(node: CstNode): AttributeAST {
    return this.buildAttribute(node)
  }

  attributeArguments(node: CstNode): AttributeArgumentAST[] {
    const children = node.children
    return getNodes(children, 'attributeArgument').map((child) => this.attributeArgument(child))
  }

  attributeArgument(node: CstNode): AttributeArgumentAST {
    const children = node.children
    const name = getTokens(children, 'name')[0]?.image
    const arrayNode = getNodes(children, 'arrayValue')[0]
    const functionNode = getNodes(children, 'functionCall')[0]
    const valueToken = getTokens(children, 'value')[0]
    const elements = arrayNode ? this.arrayElements(arrayNode) : undefined

    let value: AttributeValue = ''

    if (elements) {
      value = elements.map((element) => element.value)
    } else if (functionNode) {
      value = this.functionCall(functionNode)
    } else if (valueToken) {
      value = parseScalar(valueToken)
    }

    return {
      type: 'AttributeArgument',
      span: this.getSpan(node),
      name,
      value,
      ...(elements ? { elements } : {}),
    }
  }

  arrayValue(node: CstNode): Array<string | number | boolean> {
    return this.arrayElements(node).map((element) => element.value)
  }

  arrayElement(node: CstNode): ArrayElementAST {
    const children = node.children
    const token = getTokens(children, 'element')[0]
    const argsNode = getNodes(children, 'attributeArguments')[0]

    return {
      type: 'ArrayElement',
      span: this.getSpan(node),
      value: token ? parseScalar(token) : '',
      args: argsNode ? this.attributeArguments(argsNode) : [],
    }
  }

  enumDeclaration(node: CstNode): EnumAST {
    const children = node.children
    const name = getTokenImage(children, 'name')
    const values = getNodes(children, 'enumValue').map((child) => this.enumValue(child))
    const attributes = getNodes(children, 'modelAttribute').map((child) => this.modelAttribute(child))

    return {
      type: 'Enum',
      span: this.getSpan(node),
      name,
      values,
      attributes,
    }
  }

  enumValue(node: CstNode): EnumValueAST {
    const children = node.children
    const name = getTokenImage(children, 'name')
    const attributes = getNodes(children, 'fieldAttribute').map((child) => this.fieldAttribute(child))

    return {
      type: 'EnumValue',
      span: this.getSpan(node),
      name,
      attributes,
    }
  }

  private arrayElements(node: CstNode): ArrayElementAST[] {
    return getNodes(node.children, 'arrayElement').map((child) => this.arrayElement(child))
  }

  private buildModelLike(node: CstNode, kind: 'Model' | 'Type' | 'View') {
    const children = node.children
    const name = getTokenImage(children, 'name')
    const body = getNodes(children, 'modelBody')[0]
    const bodyChildren = body ? body.children : ({} as CstChildren)
    const fields = getNodes(bodyChildren, 'field').map((child) => this.field(child))
    const attributes = getNodes(bodyChildren, 'modelAttribute').map((child) => this.modelAttribute(child))

    return {
      type: kind,
      span: this.getSpan(node),
      name,
      fields,
      attributes,
    }
  }

  private buildAttribute(node: CstNode): AttributeAST {
    const children = node.children
    const baseName = getTokenImage(children, 'name')
    const nativeTypeName = getTokenImage(children, 'nativeTypeName')
    const name = nativeTypeName ? `${baseName}.${nativeTypeName}` : baseName
    const argsNode = getNodes(children, 'attributeArguments')[0]
    const args = argsNode ? this.attributeArguments(argsNode) : []

    return {
      type: 'Attribute',
      span: this.getSpan(node),
      name,
      args,
    }
  }

  private getSpan(node: CstNode) {
    return spanFromLocation(node.location)
  }

  visit(cstNode: CstNode | CstNode[], _param?: unknown): unknown {
    if (Array.isArray(cstNode)) {
      return cstNode.map((node) => this.visit(node))
    }

    const methodName = cstNode.name
    const visitor = this as unknown as Record<string, (node: CstNode) => unknown>
    const method = visitor[methodName]
    if (typeof method === 'function') {
      return method.call(this, cstNode)
    }
    throw new Error(`No visit method for ${cstNode.name}`)
  }
}

// Main parsing function
export function parseSchemaWithChevrotain(text: string): ParseResult {
  const lexResult = tokenizeSchema(text)

  if (lexResult.errors.length > 0) {
    return {
      ast: {
        type: 'Schema',
        span: { start: DEFAULT_POSITION, end: DEFAULT_POSITION },
        datasources: [],
        generators: [],
        models: [],
        types: [],
        views: [],
        enums: [],
      },
      errors: lexResult.errors.map((err) => ({
        message: err.message,
        span: {
          start: {
            line: err.line ?? DEFAULT_POSITION.line,
            column: err.column ?? DEFAULT_POSITION.column,
            offset: err.offset ?? DEFAULT_POSITION.offset,
          },
          end: {
            line: err.line ?? DEFAULT_POSITION.line,
            column: err.column ?? DEFAULT_POSITION.column,
            offset: (err.offset ?? DEFAULT_POSITION.offset) + err.length,
          },
        },
        severity: 'error' as const,
      })),
    }
  }

  const parser = new Parser()
  const visitor = new SchemaVisitor(parser)

  parser.input = lexResult.tokens
  const cst = parser.schema()

  if (parser.errors.length > 0) {
    return {
      ast: {
        type: 'Schema',
        span: { start: DEFAULT_POSITION, end: DEFAULT_POSITION },
        datasources: [],
        generators: [],
        models: [],
        types: [],
        views: [],
        enums: [],
      },
      errors: parser.errors.map((err) => ({
        message: err.message,
        span: spanFromRecognitionError(err),
        severity: 'error' as const,
      })),
    }
  }

  const ast = visitor.schema(cst)

  return {
    ast,
    errors: [],
  }
}
